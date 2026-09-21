import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { bumpVersion, nextVersion, readVersions, validateVersion } from "../release/versions.mjs";
import { DATASET_VERSION, assertDatasetVersionsAgree, datasetVersionDrift } from "../lib/dataset-version.mjs";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "topostack-versions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const base = pathToFileURL(directory + "/");
  for (const path of ["apps/generator", "packages/core", "packages/data-contracts", "workers/map-api", "atomm"]) await mkdir(new URL(path, base), { recursive: true });
  for (const path of ["package.json", "package-lock.json", "apps/generator/package.json", "packages/core/package.json", "packages/data-contracts/package.json", "workers/map-api/package.json", "atomm/version.json"]) {
    await writeFile(new URL(path, base), await readFile(new URL(`../../${path}`, import.meta.url)));
  }
  return base;
}

test("validates stable and prerelease versions without ambiguous numeric identifiers", () => {
  for (const version of ["0.1.0", "1.0.0-rc.1", "2.0.0-beta-2", "2.0.0-0"]) assert.equal(validateVersion(version), version);
  for (const version of [undefined, "v1.0.0", "01.0.0", "1.0", "1.0.0-01", "1.0.0-", "1.0.0+build", "1.0.0\n"]) assert.throws(() => validateVersion(version));
  assert.equal(nextVersion("0.1.9", "patch"), "0.1.10");
  assert.equal(nextVersion("0.1.9", "minor"), "0.2.0");
  assert.equal(nextVersion("0.1.9", "major"), "1.0.0");
  assert.equal(nextVersion("1.0.0-rc.1", "patch"), "1.0.0");
  assert.equal(nextVersion("0.1.0", "1.0.0-rc.1"), "1.0.0-rc.1");
});

test("main bumps synchronize every workspace, lock entry and the Atomm manifest without changing dependency data", async (t) => {
  const base = await fixture(t);
  const oldLock = JSON.parse(await readFile(new URL("package-lock.json", base), "utf8"));
  const version = await bumpVersion("main", "minor", base);
  assert.deepEqual(await readVersions(base), { version, atommVersion: version });
  assert.equal(JSON.parse(await readFile(new URL("atomm/version.json", base), "utf8")).version, version, "the Atomm package moves with the main version");
  const newLock = JSON.parse(await readFile(new URL("package-lock.json", base), "utf8"));
  assert.equal(JSON.parse(await readFile(new URL("packages/data-contracts/package.json", base), "utf8")).version, version);
  oldLock.version = version;
  for (const path of ["", "apps/generator", "packages/core", "packages/data-contracts", "workers/map-api"]) oldLock.packages[path].version = version;
  assert.deepEqual(newLock, oldLock);
});

test("Atomm cannot be bumped or drift on its own, and invalid input makes no edits", async (t) => {
  const base = await fixture(t);
  const before = await readVersions(base);
  const lock = await readFile(new URL("package-lock.json", base), "utf8");
  await assert.rejects(bumpVersion("atomm", "patch", base), /follows the main version/);
  await assert.rejects(bumpVersion("main", "broken", base));
  await assert.rejects(bumpVersion("other", "patch", base));
  assert.deepEqual(await readVersions(base), before);
  assert.equal(await readFile(new URL("package-lock.json", base), "utf8"), lock);
  await writeFile(new URL("atomm/version.json", base), JSON.stringify({ version: "9.9.9" }));
  await assert.rejects(readVersions(base), /atomm\/version\.json is out of sync/);
});

test("detects workspace and lock drift before attempting a bump", async (t) => {
  const base = await fixture(t);
  await writeFile(new URL("packages/core/package.json", base), JSON.stringify({ version: "99.0.0" }));
  await assert.rejects(readVersions(base), /out of sync/);
  await assert.rejects(bumpVersion("main", "patch", base), /out of sync/);
});

for (const file of ["packages/data-contracts/package.json", "package-lock.json"]) {
  test(`rejects data-contracts version drift in ${file}`, async (t) => {
    const base = await fixture(t);
    const url = new URL(file, base);
    const value = JSON.parse(await readFile(url, "utf8"));
    if (file === "package-lock.json") value.packages["packages/data-contracts"].version = "99.0.0";
    else value.version = "99.0.0";
    await writeFile(url, JSON.stringify(value));
    await assert.rejects(readVersions(base), /packages\/data-contracts.*out of sync/);
    await assert.rejects(bumpVersion("main", "patch", base), /packages\/data-contracts.*out of sync/);
  });
}

test("the deployed dataset version is derived from one snapshot constant", async () => {
  // wrangler.jsonc cannot import the worker's constant, so every environment's
  // DATASET_VERSION is checked against it here and by `npm run version:check`.
  assert.match(DATASET_VERSION, /^mapzen-terrarium\+protomaps-\d{8}-z12-v1$/);
  assert.equal(await assertDatasetVersionsAgree(), DATASET_VERSION);
  const stale = "mapzen-terrarium+protomaps-20260801-z12-v1";
  assert.deepEqual(datasetVersionDrift({ vars: { DATASET_VERSION }, env: { development: { vars: { DATASET_VERSION } }, production: { vars: { DATASET_VERSION } } } }), []);
  assert.deepEqual(datasetVersionDrift({ vars: { DATASET_VERSION: stale }, env: { production: { vars: {} } } }), [`top-level: ${stale}`, "production: missing"]);
  await assert.rejects(assertDatasetVersionsAgree({ vars: { DATASET_VERSION: stale } }), /must equal mapzen-terrarium/);
});
