import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { stageArchive, verifyPromotionGateway } from "../lib/archive-provisioning.mjs";
import { GEOCODE_EXPIRY_RULE, reconcileCacheLifecycle, hasGeocodeExpiry } from "../lib/cache-lifecycle.mjs";

const bytes = new Uint8Array(127).fill(3);
const digest = createHash("sha256").update(bytes).digest("hex");
const id = "12345678-1234-1234-1234-123456789abc";
const release = { schemaVersion: 1, logicalKey: "osm/current.pmtiles", objectKey: `archives/${digest}/${id}.pmtiles`, sha256: digest, dataset: "fixture", bytes: 127, etag: '"fixture"', verifiedAt: "2026-09-16T00:00:00Z" };

function scenario({ corrupted = false, pointerStatus = 404, promoteStatus = 200, truncated = false } = {}) {
  const events = [], receipts = [], puts = [];
  const options = { logicalKey: release.logicalKey, dataset: "fixture", bytes: 127, sha256: digest, id,
    upload: async () => { events.push("upload"); },
    checkpoint: async (receipt) => { receipts.push(structuredClone(receipt)); events.push("receipt"); },
    request: async (key, init) => {
      if (init.method === "PUT") { events.push("promote"); puts.push(init); return new Response(null, { status: promoteStatus }); }
      if (key.startsWith("releases/")) return pointerStatus === 200 ? Response.json(release, { headers: { etag: '"previous"' } }) : new Response(null, { status: pointerStatus });
      events.push("verify");
      const body = corrupted ? bytes.slice().fill(4) : truncated ? bytes.slice(0, -1) : bytes;
      return new Response(body, { headers: { "content-length": "127", etag: '"fixture"' } });
    },
  };
  return { options, events, puts, receipts };
}

test("staging verifies full bytes but never activates implicitly", async () => {
  const s = scenario(); const result = await stageArchive(s.options);
  assert.equal(result.promoted, false); assert.deepEqual(s.events, ["upload", "verify", "receipt"]);
});
test("activation follows full verification and retains rollback receipt", async () => {
  const s = scenario({ pointerStatus: 200 }); await stageArchive({ ...s.options, promote: true });
  assert.deepEqual(s.events, ["upload", "verify", "receipt", "promote", "receipt"]);
  assert.equal(s.puts[0].headers["if-match"], '"previous"');
  assert.deepEqual(s.receipts[0].previousRelease, release); assert.equal(s.receipts[1].promoted, true);
});
test("first activation cannot overwrite a concurrently created pointer", async () => {
  const s = scenario({ promoteStatus: 412 });
  await assert.rejects(stageArchive({ ...s.options, promote: true }), /promotion failed/);
  assert.equal(s.puts[0].headers["if-none-match"], "*"); assert.equal(s.receipts[0].promoted, false);
});
for (const options of [{ corrupted: true }, { truncated: true }, { pointerStatus: 403 }]) test(`failed verification never activates: ${JSON.stringify(options)}`, async () => {
  const s = scenario(options); await assert.rejects(stageArchive({ ...s.options, promote: true })); assert.equal(s.puts.length, 0);
});
test("expiry preserves multipart cleanup and is idempotent", () => {
  const existing = { id: "abort", enabled: true, conditions: {}, abortMultipartUploadsTransition: { condition: { type: "Age", maxAge: 604800 } } };
  const next = reconcileCacheLifecycle({ rules: [existing] });
  assert.deepEqual(next.rules, [existing, GEOCODE_EXPIRY_RULE]); assert.ok(hasGeocodeExpiry(next));
  assert.deepEqual(reconcileCacheLifecycle(next), next);
});
test("expiry refuses to carry forward broad deletion rules", () => {
  for (const prefix of ["", "terrain/", "lakes/"]) assert.throws(() => reconcileCacheLifecycle({ rules: [{ id: "unsafe", enabled: true, conditions: { prefix }, deleteObjectsTransition: { condition: { type: "Age", maxAge: 1 } } }] }));
});

test("activation requires the deployed gateway to understand release pointers", async () => {
  await assert.rejects(verifyPromotionGateway("https://example.test", async () => Response.json({ schemaVersion: 1 })), /Deploy the release-aware gateway/);
  await verifyPromotionGateway("https://example.test", async () => Response.json({ capabilities: { archiveReleases: 1 } }));
});
