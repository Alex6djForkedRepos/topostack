/**
 * Build output that only the public site reaches: the marketing, guide and
 * sharing-card images and the example project files from
 * `apps/generator/static/`, and the in-chat preview page (`mcp-app/`). The
 * Atomm build drops them (scripts/build/prune-atomm-dist.mjs) and the Atomm
 * verifier rejects a package that still holds them.
 */
export const SITE_ONLY_PATHS = [
  "images/cards",
  "images/examples",
  "images/guides",
  "images/social-crater-lake.png",
  "images/studio-crater-lake.png",
  "images/studio-crater-lake.webp",
  "images/studio-crater-lake-640.webp",
  "examples",
  // The in-chat preview is served by the Worker's MCP server, never by Atomm.
  "mcp-app",
];
