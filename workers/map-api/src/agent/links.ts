import type { ProjectConfigV1 } from "@topostack/core/project";
import { shareUrl } from "@topostack/data-contracts/share-link";

/**
 * The studio link that opens `project` and generates it straight away. The
 * design rides in the fragment, which never reaches a server, so the link is
 * the whole hand-off: files are made and exported in the visitor's browser.
 */
export function studioLink(project: ProjectConfigV1, origin: string): string {
  const { explodedPreview: _previewOnly, ...design } = project;
  return shareUrl(design, new URL("/studio", origin).toString(), "?generate=1");
}
