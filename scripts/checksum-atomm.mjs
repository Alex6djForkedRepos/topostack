import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readVersions } from "./versions.mjs";

// Every check runs before any release output is written, so a failed release
// never leaves a checksum or receipt describing an unverified archive.
const rawApiUrl = process.env.VITE_MAP_API_URL;
if (!rawApiUrl) {
  console.error("VITE_MAP_API_URL is required to record Atomm release evidence (use the same value as `npm run package:atomm`).");
  process.exit(1);
}
let apiOrigin;
try {
  apiOrigin = new URL(rawApiUrl).origin;
} catch {
  console.error(`VITE_MAP_API_URL is not a valid URL: ${JSON.stringify(rawApiUrl)}`);
  process.exit(1);
}

const archiveUrl = new URL("../apps/generator/topostack-atomm.zip", import.meta.url);
const archive = await readFile(archiveUrl);
const digest = createHash("sha256").update(archive).digest("hex");

async function readApi(path) {
  const response = await fetch(new URL(path, apiOrigin), { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Release evidence ${path} returned HTTP ${response.status}.`);
  return response.json();
}
const [manifest, readiness] = await Promise.all([readApi("/v1/manifest"), readApi("/ready")]);
const versions = await readVersions();
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const build = JSON.parse(execFileSync("unzip", ["-p", fileURLToPath(archiveUrl), "version.json"], { encoding: "utf8" }));
assert.equal(build.environment, "atomm");
assert.equal(build.version, versions.version);
assert.equal(build.atommVersion, versions.atommVersion);
assert.equal(build.commit, commit);
const receipt = {
  ...versions,
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  commit,
  workingTreeDirty: Boolean(execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()),
  archive: "topostack-atomm.zip", sha256: digest, bytes: archive.byteLength,
  apiOrigin, datasetVersion: manifest.datasetVersion,
  vectorData: readiness.dependencies.vectorData,
  lakeData: readiness.dependencies.lakeData,
};

const outputs = [
  [fileURLToPath(new URL("../apps/generator/topostack-atomm.zip.sha256", import.meta.url)), `${digest}  topostack-atomm.zip\n`],
  [fileURLToPath(new URL("../apps/generator/topostack-atomm.release.json", import.meta.url)), JSON.stringify(receipt, null, 2) + "\n"],
];
try {
  for (const [target, contents] of outputs) await writeFile(`${target}.part`, contents, "utf8");
} catch (error) {
  await Promise.all(outputs.map(([target]) => rm(`${target}.part`, { force: true })));
  throw error;
}
for (const [target] of outputs) await rename(`${target}.part`, target);
console.log(`SHA-256 ${digest}`);
