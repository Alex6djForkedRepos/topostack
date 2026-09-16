import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { validatePackage, validateRun } from "../publish-atomm-release.mjs";

const commit = "a".repeat(40);
const repository = "Echo-Foxtrot-Works/topostack";
const run = { repository: { full_name: repository }, path: ".github/workflows/ci.yml", head_branch: "main", event: "push", status: "completed", conclusion: "success", head_sha: commit };
const archive = Buffer.from("test artifact bytes");
const digest = createHash("sha256").update(archive).digest("hex");
const receipt = { schemaVersion: 1, commit, workingTreeDirty: false, apiOrigin: "https://topostack.echofoxtrot.works", archive: "topostack-atomm.zip", bytes: archive.length, sha256: digest };
const checksum = `${digest}  topostack-atomm.zip\n`;

test("accepts completed production CI and its matching clean artifact", () => {
  validateRun(run, repository);
  assert.equal(validatePackage(receipt, archive, checksum, commit), digest);
});

test("rejects untrusted, incomplete, failed, PR, and development runs", () => {
  for (const patch of [{ repository: { full_name: "other/repo" } }, { path: ".github/workflows/other.yml" }, { head_branch: "dev" }, { event: "pull_request" }, { status: "in_progress" }, { conclusion: "failure" }, { head_sha: "main" }]) {
    assert.throws(() => validateRun({ ...run, ...patch }, repository));
  }
});

test("rejects mismatched, dirty, nonproduction, and tampered artifacts", () => {
  for (const patch of [{ commit: "b".repeat(40) }, { workingTreeDirty: true }, { apiOrigin: "https://dev-topostack.echofoxtrot.works" }, { bytes: 1 }, { sha256: "0".repeat(64) }, { archive: "other.zip" }]) {
    assert.throws(() => validatePackage({ ...receipt, ...patch }, archive, checksum, commit));
  }
  assert.throws(() => validatePackage(receipt, Buffer.from("tampered"), checksum, commit));
  assert.throws(() => validatePackage(receipt, archive, `${digest}  other.zip`, commit));
});
