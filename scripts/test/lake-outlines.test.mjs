import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../../apps/generator/static/data/lake-outlines/", import.meta.url);
const json = async (url) => JSON.parse(await readFile(url, "utf8"));

test("every regional surveyed lake has a valid, indexed, checksum-matched outline asset", async () => {
  const directory = await json(new URL("../lake-depth-directory.json", root));
  const index = await json(new URL("index.json", root));
  const audit = await json(new URL("../data/lake-outline-coverage.json", import.meta.url));
  const entries = new Map(directory.lakes.map((lake) => [lake.id, lake]));
  const seen = new Set();
  assert.equal(index.schemaVersion, 1);
  for (const shard of index.shards) {
    assert.match(shard.file, /^[a-f0-9]{24}\.json$/);
    const bytes = await readFile(new URL(shard.file, root));
    assert.equal(createHash("sha256").update(bytes).digest("hex").slice(0, 24) + ".json", shard.file);
    assert(bytes.length < 5_000_000, "Each shard must fit the bounded browser download budget");
    const { features } = JSON.parse(bytes);
    assert.equal(features.length, shard.count);
    for (const feature of features) {
      const id = `${feature.properties.sourceId}:${feature.properties.surveyId}`;
      assert(entries.has(id), `Unknown survey: ${id}`);
      assert(!seen.has(id), `Duplicate survey: ${id}`);
      seen.add(id);
      assert.equal(shard.sourceId, feature.properties.sourceId);
      const [w, s, e, n] = feature.bbox;
      assert(w < e && s < n && w >= -180 && e <= 180 && s > -85.1 && n < 85.1);
      assert(shard.bounds[0] <= w && shard.bounds[1] <= s && shard.bounds[2] >= e && shard.bounds[3] >= n);
      assert(["Polygon", "MultiPolygon"].includes(feature.geometry.type));
      const parts = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      assert(parts.length > 0);
      for (const rings of parts) for (const ring of rings) {
        assert(ring.length >= 4);
        assert.deepEqual(ring[0], ring.at(-1));
        assert(ring.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= w - 1e-7 && x <= e + 1e-7 && y >= s - 1e-7 && y <= n + 1e-7));
      }
    }
  }
  assert.equal(seen.size, audit.providerOutlines);
  assert.equal(entries.size, audit.directoryEntries);
  assert.equal(audit.entries.length, entries.size);
  assert.deepEqual(new Set(audit.entries.map((entry) => entry.id)), new Set(entries.keys()));
  for (const entry of audit.entries) {
    assert(entries.has(entry.id));
    if (entry.outline === "provider") assert(seen.has(entry.id), `Missing outline: ${entry.id}`);
    else {
      assert.match(entry.id, /^(noaa-great-lakes-v1|usgs-[^:]+|swissbathy3d-v1):/);
      assert.equal(entry.outline, "external-fallback");
      assert(entry.reason);
    }
  }
});
