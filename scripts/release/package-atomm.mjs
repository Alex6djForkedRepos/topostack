/**
 * Build and package the Atomm static artifact as a versioned Atomm ZIP.
 *
 * Each step must exit successfully before the next runs: validate the API
 * origin, build with VITE_SITE_ENV=atomm, verify the built artifact (full
 * endpoint scan), then zip the dist directory contents.
 */
import { fileURLToPath } from "node:url";
import { readVersions } from "./versions.mjs";
import { atommReleaseFiles } from "../lib/atomm-release-files.mjs";
import { run } from "../lib/process.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const dist = fileURLToPath(new URL("../../apps/generator/dist/", import.meta.url));
const files = atommReleaseFiles((await readVersions()).atommVersion);
const archive = fileURLToPath(new URL(`../apps/generator/${files.archive}`, import.meta.url));

try {
  await run(process.execPath, ["scripts/release/validate-submission-env.mjs"], { cwd: root });
  await run("npm", ["run", "build", "-w", "@topostack/generator"], { cwd: root, env: { ...process.env, VITE_SITE_ENV: "atomm" } });
  await run(process.execPath, ["scripts/verify/verify-atomm-dist.mjs", "--require-sdk-entry"], { cwd: root });
  // -FS syncs an existing archive with dist (removing stale entries); -r recurses; -q is quiet.
  await run("zip", ["-FSqr", archive, "."], { cwd: dist });
} catch (error) {
  console.error(`Atomm packaging failed: ${error.message}`);
  process.exit(1);
}
console.log(`Packaged ${archive}`);
