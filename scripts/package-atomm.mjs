/**
 * Build and package the Atomm static artifact as apps/generator/topostack-atomm.zip.
 *
 * Each step must exit successfully before the next runs: validate the API
 * origin, build with VITE_SITE_ENV=atomm, verify the built artifact (full
 * endpoint scan), then zip the dist directory contents.
 */
import { fileURLToPath } from "node:url";
import { run } from "./lib/process.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = fileURLToPath(new URL("../apps/generator/dist/", import.meta.url));
const archive = fileURLToPath(new URL("../apps/generator/topostack-atomm.zip", import.meta.url));

try {
  await run(process.execPath, ["scripts/validate-submission-env.mjs"], { cwd: root });
  await run("npm", ["run", "build", "-w", "@topostack/generator"], { cwd: root, env: { ...process.env, VITE_SITE_ENV: "atomm" } });
  await run(process.execPath, ["scripts/verify-atomm-dist.mjs", "--require-sdk-entry"], { cwd: root });
  // -FS syncs an existing archive with dist (removing stale entries); -r recurses; -q is quiet.
  await run("zip", ["-FSqr", archive, "."], { cwd: dist });
} catch (error) {
  console.error(`Atomm packaging failed: ${error.message}`);
  process.exit(1);
}
console.log(`Packaged ${archive}`);
