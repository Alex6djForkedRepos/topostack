import rawSurveyCatalog from "../../../../scripts/data/lake-bathymetry.json";
import rawTerrainCatalog from "../../../../scripts/data/terrain-sources.json";
import { validateSurveyCatalog, validateTerrainCatalog } from "../../../../packages/core/src/source-catalog";
import { cachedArchiveHead, evictArchiveHead } from "../archive-release";
import { etagMatches, json } from "../http";

export const MAX_ARCHIVE_RANGE_BYTES = 16 * 1024 * 1024;
// The vector archive key is overwritten in place on dataset updates, so client
// and edge caching must stay short and revalidate by etag; a long `immutable`
// TTL would let PMTiles readers mix byte ranges from different archive
// generations for the full cache lifetime.
const ARCHIVE_CACHE_SECONDS = 60 * 60;
const INVALID_RELEASE_RETRY_SECONDS = 30;
export const VECTOR_ARCHIVE_KEY = "osm/current.pmtiles";
export const LAKE_ARCHIVE_KEY = "lakes/current.pmtiles";

export interface ArchiveRoute { key: string; label: string }

const terrainCatalog = validateTerrainCatalog(rawTerrainCatalog);
const bathymetryCatalog = validateSurveyCatalog(rawSurveyCatalog);

export const terrainArchives = terrainCatalog.sources.map((source) => ({ source, path: `/v1/terrain-sources/${source.id}.pmtiles`, key: `terrain-sources/${source.id}.pmtiles` }));
export const bathymetryArchives = bathymetryCatalog.sources.map((source) => ({ source, path: `/v1/bathymetry/${source.id}.pmtiles`, key: `bathymetry/${source.id}.pmtiles` }));

/** Every public PMTiles path and the logical R2 key it resolves through. */
export const ARCHIVE_ROUTES: ReadonlyMap<string, ArchiveRoute> = new Map<string, ArchiveRoute>([
  ["/v1/osm.pmtiles", { key: VECTOR_ARCHIVE_KEY, label: "OSM" }],
  ["/v1/lakes.pmtiles", { key: LAKE_ARCHIVE_KEY, label: "Lake bathymetry" }],
  ...terrainArchives.map(({ path, key }): [string, ArchiveRoute] => [path, { key, label: "High-resolution terrain" }]),
  ...bathymetryArchives.map(({ path, key }): [string, ArchiveRoute] => [path, { key, label: "Lake survey bathymetry" }]),
]);

type ParsedRange =
  | { kind: "missing" }
  | { kind: "partial"; offset: number; length: number }
  | { kind: "unsatisfiable" }
  | { kind: "too_large" };

// Single-range parsing only. Multipart range requests (`bytes=0-1,5-6`) are
// rejected with 416 rather than answered with a multipart/byteranges body.
// Full archive downloads are intentionally unavailable: PMTiles clients only
// need bounded byte ranges, and the underlying archives are multi-GB.
export function parseRangeHeader(header: string | null, size: number): ParsedRange {
  if (header === null) return { kind: "missing" };
  if (header.includes(",")) return { kind: "unsatisfiable" };
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return { kind: "unsatisfiable" };
  if (size === 0) return { kind: "unsatisfiable" };
  let offset: number;
  let length: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix === 0) return { kind: "unsatisfiable" };
    length = Math.min(suffix, size);
    offset = size - length;
  } else {
    const start = Number(match[1]);
    if (!Number.isSafeInteger(start) || start >= size) return { kind: "unsatisfiable" };
    offset = start;
    if (match[2] === "") {
      length = size - start;
    } else {
      const end = Number(match[2]);
      if (!Number.isSafeInteger(end) || end < start) return { kind: "unsatisfiable" };
      length = Math.min(end, size - 1) - start + 1;
    }
  }
  return length > MAX_ARCHIVE_RANGE_BYTES ? { kind: "too_large" } : { kind: "partial", offset, length };
}

export async function pmtilesResponse(request: Request, env: Env, archive: ArchiveRoute, retried = false): Promise<Response> {
  let resolved;
  try {
    resolved = await cachedArchiveHead(env.VECTOR_DATA, archive.key);
  } catch (error) {
    console.error(JSON.stringify({ message: "archive_release_invalid", key: archive.key, error: error instanceof Error ? error.message : String(error) }));
    return json({ error: `${archive.label} archive is temporarily unavailable. Try again shortly.` }, {
      status: 503, headers: { "retry-after": String(INVALID_RELEASE_RETRY_SECONDS), "cache-control": "no-store" },
    });
  }
  const head = resolved.head;
  if (!head) return json({ error: `${archive.label} archive has not been provisioned.` }, { status: 404 });
  const headers = new Headers({
    "etag": head.httpEtag,
    "accept-ranges": "bytes",
    "content-type": "application/vnd.pmtiles",
    "cache-control": `public, max-age=${ARCHIVE_CACHE_SECONDS}`,
    "x-topostack-cache": "R2",
    "x-topostack-dataset": env.DATASET_VERSION,
  });
  if (etagMatches(request.headers.get("if-none-match"), head.httpEtag)) return new Response(null, { status: 304, headers });
  if (request.method === "HEAD") {
    headers.set("content-length", String(head.size));
    return new Response(null, { headers });
  }
  const range = parseRangeHeader(request.headers.get("range"), head.size);
  if (range.kind === "missing") {
    return json({ error: "A bounded Range header is required for PMTiles archives." }, { status: 400, headers });
  }
  // 413, not 416: PMTiles clients treat 416 as an archive change and reload.
  if (range.kind === "too_large") {
    return json({ error: `Requested range exceeds ${MAX_ARCHIVE_RANGE_BYTES} bytes.` }, { status: 413, headers });
  }
  if (range.kind === "unsatisfiable") {
    headers.set("content-range", `bytes */${head.size}`);
    return json({ error: "Requested range is not satisfiable." }, { status: 416, headers });
  }
  const object = await env.VECTOR_DATA.get(resolved.key, {
    range: { offset: range.offset, length: range.length },
    onlyIf: { etagMatches: head.etag },
  });
  // Never combine one generation's size/range with another generation's body.
  if (!object || !("body" in object)) {
    evictArchiveHead(archive.key);
    if (!retried) return pmtilesResponse(request, env, archive, true);
    if (!object) return json({ error: `${archive.label} archive has not been provisioned.` }, { status: 404 });
    return json({ error: `${archive.label} archive is being updated. Try again shortly.` }, { status: 503, headers: { "retry-after": "1" } });
  }
  headers.set("etag", object.httpEtag);
  headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
  headers.set("content-length", String(range.length));
  return new Response(object.body, { status: 206, headers });
}
