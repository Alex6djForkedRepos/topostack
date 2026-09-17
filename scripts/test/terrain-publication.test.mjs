import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateTerrainPublication } from "../lib/terrain-publication.mjs";
const read = (file) => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
const source = read("terrain-sources.json").sources[0];
const legacyReceipt = read("hrdem-builds.json").builds[0];
const pin = legacyReceipt.sources[0];
const fixture = () => ({ source, header: { bounds: source.bounds, tile_type: "png", minzoom: 0, maxzoom: 15 },
  metadata: { topostack_dataset: source.id, topostack_encoding: source.encoding, topostack_vertical_datum: source.verticalDatum,
    topostack_source_item: pin.item, topostack_source_etag: pin.etag },
  receipt: { ...structuredClone(legacyReceipt), schemaVersion: 1, encoding: source.encoding, verticalDatum: source.verticalDatum,
    verticalUnits: "metre", coverage: { validSamples: 100, totalSamples: 200 } },
  sha256: legacyReceipt.sha256, bytes: legacyReceipt.bytes, pin });

test("validates measured terrain release and original legacy hash", () => {
  validateTerrainPublication(fixture());
  validateTerrainPublication({ ...fixture(), receipt: legacyReceipt, legacy: true });
  assert.throws(() => validateTerrainPublication({ ...fixture(), receipt: legacyReceipt }), /coverage/);
});
for (const [name, mutate] of [
  ["archive extent", (f) => { f.header.bounds = [0, 1, 2, 3]; }],
  ["receipt extent", (f) => { f.receipt.grids[0].bounds = [0, 1, 2, 3]; }],
  ["missing receipt", (f) => { f.receipt = undefined; }],
  ["archive hash", (f) => { f.sha256 = "a".repeat(64); }],
  ["archive size", (f) => { f.bytes++; }],
  ["changed input", (f) => { f.pin = { ...pin, etag: '"changed"' }; }],
  ["bad coverage", (f) => { f.receipt.coverage.validSamples = 201; }],
  ["wrong units", (f) => { f.receipt.verticalUnits = "foot"; }],
  ["wrong datum", (f) => { f.metadata.topostack_vertical_datum = "NAVD88"; }],
]) test(`rejects ${name} before publication`, () => {
  const f = fixture(); mutate(f); assert.throws(() => validateTerrainPublication(f));
});

test("allows PMTiles coordinate rounding but rejects missing/invalid bounds", () => {
  const f = fixture(); f.header.bounds = source.bounds.map((n) => n + 1e-7);
  validateTerrainPublication(f);
  for (const bounds of [undefined, [], [NaN, 0, 1, 2], [null, 0, 1, 2]]) {
    assert.throws(() => validateTerrainPublication({ ...fixture(), header: { ...f.header, bounds } }));
  }
});

import { validateTerrainRegistrySnapshot } from "../lib/terrain-publication.mjs";
test("accepts the migrated registry and rejects manifest or active snapshot edits", () => {
  const catalog = read("terrain-sources.json");
  const manifest = readFileSync(new URL(`../data/${catalog.releaseManifest}`, import.meta.url));
  validateTerrainRegistrySnapshot(catalog, manifest);
  assert.throws(() => validateTerrainRegistrySnapshot({ ...catalog, sources: [] }, manifest), /mismatch/);
  assert.throws(() => validateTerrainRegistrySnapshot(catalog, Buffer.from("{}")), /mismatch/);
});
