import assert from "node:assert/strict";
import { validateVersion } from "./versions.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export function validateRun(run, repository) {
  assert.equal(run.repository.full_name, repository, "CI must belong to this repository");
  assert.equal(run.path, ".github/workflows/ci.yml", "Use the production CI workflow");
  assert.equal(run.head_branch, "main", "Only main production builds can be released");
  assert.ok(["push", "workflow_dispatch"].includes(run.event), "PR artifacts cannot be released");
  assert.equal(run.status, "completed", "CI must be complete");
  assert.equal(run.conclusion, "success", "All production CI jobs must pass");
  assert.match(run.head_sha, /^[a-f0-9]{40}$/);
}

export function validatePackage(receipt, archive, checksum, commit, tag) {
  validateVersion(receipt.version);
  validateVersion(receipt.atommVersion);
  assert.equal(tag, `atomm-v${receipt.atommVersion}`, "Release tag must match the packaged Atomm version");
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.commit, commit, "Package must match the tested commit");
  assert.equal(receipt.workingTreeDirty, false, "Package must come from a clean checkout");
  assert.equal(receipt.apiOrigin, "https://topostack.echofoxtrot.works", "Package must use the production API");
  assert.equal(receipt.archive, "topostack-atomm.zip");
  assert.equal(receipt.bytes, archive.length, "Archive size does not match its receipt");
  const digest = createHash("sha256").update(archive).digest("hex");
  assert.equal(receipt.sha256, digest, "Archive checksum does not match its receipt");
  assert.equal(checksum.trim(), `${digest}  topostack-atomm.zip`, "Checksum file does not match the archive");
  return digest;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.ATOMM_CI_RUN_ID;
  const tag = process.env.ATOMM_RELEASE_TAG;
  assert.match(repository ?? "", /^[\w.-]+\/[\w.-]+$/);
  assert.match(runId ?? "", /^\d+$/);
  assert.match(tag ?? "", /^atomm-v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/, "Use a version such as atomm-v0.1.0");
  const gh = (...args) => execFileSync("gh", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const api = (...args) => JSON.parse(gh("api", ...args));
  const run = api(`repos/${repository}/actions/runs/${runId}`);
  validateRun(run, repository);
  const directory = await mkdtemp(join(tmpdir(), "atomm-release-"));
  gh("run", "download", runId, "--repo", repository, "--name", `topostack-atomm-${run.head_sha}`, "--dir", directory);
  const code = join(directory, "apps/generator/topostack-atomm.zip");
  const checksum = code + ".sha256";
  const receiptPath = join(directory, "apps/generator/topostack-atomm.release.json");
  const listing = join(directory, "atomm/topostack-listing-upload.zip");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  const digest = validatePackage(receipt, await readFile(code), await readFile(checksum, "utf8"), run.head_sha, tag);
  const build = JSON.parse(execFileSync("unzip", ["-p", code, "version.json"], { encoding: "utf8" }));
  assert.equal(build.environment, "atomm");
  assert.equal(build.version, receipt.version);
  assert.equal(build.atommVersion, receipt.atommVersion);
  assert.equal(build.commit, receipt.commit);
  assert.equal(build.workingTreeDirty, false);
  assert.ok((await readFile(listing)).length > 0, "Listing media bundle is required");
  execFileSync("unzip", ["-tq", code], { stdio: "pipe" });
  execFileSync("unzip", ["-tq", listing], { stdio: "pipe" });
  console.log(`Verified ${tag}: ${run.head_sha}, SHA-256 ${digest}`);
  if (process.argv.includes("--dry-run")) return;

  // Ref creation is atomic: never silently reuse or move an existing version tag.
  api(`repos/${repository}/git/refs`, "--method", "POST", "-f", `ref=refs/tags/${tag}`, "-f", `sha=${run.head_sha}`);
  const notes = join(directory, "release-notes.md");
  await writeFile(notes, `Upload **topostack-atomm.zip** to the Atomm developer console. GitHub's automatic Source code archives are not the upload package.\n\n` +
    `- **topostack-atomm.zip** — static generator, opening directly in the terrain studio.\n` +
    `- **topostack-atomm.zip.sha256** — SHA-256 checksum.\n` +
    `- **topostack-atomm.release.json** — clean source commit, production API, dataset and archive metadata.\n` +
    `- **topostack-listing-upload.zip** — cover options, feature screenshots, listing copy and media provenance.\n\n` +
    `Built and deployed by [production CI run ${runId}](${run.html_url}) at commit ${run.head_sha}. These are the exact verified CI assets, without a local rebuild.\n\n` +
    `Main codebase: **${receipt.version}**. Atomm package: **${receipt.atommVersion}**.\n\n` +
    `ZIP SHA-256: \`${digest}\`\n\nAtomm host review and physical fabrication acceptance are separate from automated CI.\n`);
  const prerelease = tag.slice("atomm-v".length).includes("-");
  const flags = prerelease ? ["--prerelease"] : [];
  // Stage all files on a draft before publishing, including for immutable releases.
  gh("release", "create", tag, code, checksum, receiptPath, listing, "--repo", repository,
    "--verify-tag", "--draft", "--title", `TopoStack ${tag.slice("atomm-".length)} for Atomm`, "--notes-file", notes, ...flags);
  gh("release", "edit", tag, "--repo", repository, "--draft=false", `--latest=${!prerelease}`, ...flags);
  console.log(gh("release", "view", tag, "--repo", repository, "--json", "url", "--jq", ".url").trim());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
