import { parseProject, type ProjectConfigV1 } from "@topostack/core";
import { decodeShareFragment, hasShareFragment, shareUrl } from "@topostack/data-contracts/share-link";

/** The link codec is shared with the map-api Worker, which mints links for agents. */
export { MAX_SHARE_URL_LENGTH, ShareLinkTooLongError } from "@topostack/data-contracts/share-link";

/** The absolute studio URL that reopens `project`; throws ShareLinkTooLongError past MAX_SHARE_URL_LENGTH. */
export function shareLinkFor(project: ProjectConfigV1, studioUrl: string): string {
  // The exploded-view slider is preview state, not part of the design.
  const { explodedPreview: _previewOnly, ...design } = project;
  return shareUrl(design, studioUrl);
}

export const hasShareLink = hasShareFragment;

/** Decodes and validates a share fragment; the link is untrusted input, so it passes the same checks as an imported file. */
export function projectFromShareLink(hash: string): ProjectConfigV1 {
  return parseProject(decodeShareFragment(hash));
}
