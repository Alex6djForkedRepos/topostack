/**
 * Files in `apps/generator/static/` that only the public site reaches: the
 * marketing and guide images and the example project files. The Atomm build
 * drops them (scripts/build/prune-atomm-dist.mjs) and the Atomm verifier
 * rejects a package that still holds them.
 */
export const SITE_ONLY_PATHS = [
  "images/examples",
  "images/guides",
  "images/social-crater-lake.png",
  "images/studio-crater-lake.png",
  "images/studio-crater-lake.webp",
  "images/studio-crater-lake-640.webp",
  "examples",
];
