import { deflateSync, Inflate } from "fflate";
import type { ProjectConfigV1 } from "@topostack/core";
import { parseProject } from "$lib/storage/storage";

/**
 * Share links carry the whole project in the URL fragment, which browsers never
 * send to a server: `#p=1.<base64url(deflate-raw(JSON))>`. The `1.` prefix is
 * the link format, independent of the project schema version inside it.
 */
const PREFIX = "p=1.";
/** Links longer than this are unreliable in chat apps and some browsers. */
export const MAX_SHARE_URL_LENGTH = 8_000;
const MAX_ENCODED_LENGTH = 16_000;
/** The same ceiling as an imported project file. */
const MAX_DECODED_BYTES = 2_000_000;
/** Deflate expands at most ~1032:1, so small input slices keep each inflate step bounded. */
const INFLATE_SLICE_BYTES = 1_024;

export class ShareLinkTooLongError extends Error {
  constructor() { super("This design is too large for a link. Export the project file instead."); }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error("Share link is not valid.");
  let binary: string;
  try { binary = atob(text.replace(/-/g, "+").replace(/_/g, "/")); }
  catch { throw new Error("Share link is not valid."); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function boundedInflate(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflate = new Inflate((chunk) => {
    total += chunk.length;
    if (total > MAX_DECODED_BYTES) throw new Error("Share link is too large.");
    chunks.push(chunk);
  });
  for (let offset = 0; offset < data.length; offset += INFLATE_SLICE_BYTES) {
    const end = Math.min(offset + INFLATE_SLICE_BYTES, data.length);
    inflate.push(data.subarray(offset, end), end === data.length);
  }
  if (data.length === 0) inflate.push(new Uint8Array(0), true);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}

/** The absolute studio URL that reopens `project`; throws ShareLinkTooLongError past MAX_SHARE_URL_LENGTH. */
export function shareLinkFor(project: ProjectConfigV1, studioUrl: string): string {
  // The exploded-view slider is preview state, not part of the design.
  const { explodedPreview: _previewOnly, ...design } = project;
  const payload = toBase64Url(deflateSync(new TextEncoder().encode(JSON.stringify(design)), { level: 9 }));
  const url = new URL(studioUrl);
  url.search = "";
  url.hash = `${PREFIX}${payload}`;
  const link = url.toString();
  if (link.length > MAX_SHARE_URL_LENGTH) throw new ShareLinkTooLongError();
  return link;
}

export function hasShareLink(hash: string): boolean {
  return hash.replace(/^#/, "").startsWith("p=");
}

/** Decodes and validates a share fragment; the link is untrusted input, so it passes the same checks as an imported file. */
export function projectFromShareLink(hash: string): ProjectConfigV1 {
  const fragment = hash.replace(/^#/, "");
  if (!fragment.startsWith(PREFIX)) throw new Error("This share link was made by a newer or unknown version of TopoStack.");
  const encoded = fragment.slice(PREFIX.length);
  if (encoded.length === 0 || encoded.length > MAX_ENCODED_LENGTH) throw new Error("Share link is not valid.");
  const compressed = fromBase64Url(encoded);
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(boundedInflate(compressed)));
  } catch (error) {
    throw new Error(error instanceof Error && error.message === "Share link is too large." ? error.message : "Share link is damaged or incomplete.", { cause: error });
  }
  return parseProject(value);
}
