import { validateVersion } from "../versions.mjs";

/** Filenames use the Atomm release version, independently of the main app version. */
export function atommReleaseFiles(version) {
  validateVersion(version);
  const stem = `topostack-atomm-v${version}`;
  return {
    archive: `${stem}.zip`,
    checksum: `${stem}.zip.sha256`,
    receipt: `${stem}.release.json`,
    listing: `topostack-listing-upload-v${version}.zip`,
  };
}
