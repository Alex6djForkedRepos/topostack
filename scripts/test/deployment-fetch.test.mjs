import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithRetry } from "../lib/deployment-fetch.mjs";

const base = new URL("https://ci.invalid");
const path = "/v1/osm.pmtiles";
const preflight = { method: "OPTIONS", headers: { origin: "https://topostack.generator.atommapps.com" } };

for (const status of [403, 404, 429, 503]) {
  test(`deployment verification recovers after a transient ${status}`, async (t) => {
    const stale = new Response("previous deployment", { status });
    const ready = new Response(null, { status: 204 });
    const responses = [stale, ready];
    const fetch = t.mock.method(globalThis, "fetch", async () => responses.shift());
    t.mock.method(console, "warn", () => {});
    const response = await fetchWithRetry(base, path, preflight, { allowRolloutStatuses: true, retryDelayMs: 0 });
    assert.equal(response, ready);
    assert.equal(stale.bodyUsed, true);
    assert.equal(fetch.mock.callCount(), 2);
    for (const { arguments: [url, init] } of fetch.mock.calls) {
      assert.equal(url.href, new URL(path, base).href);
      assert.equal(init.method, "OPTIONS");
      assert.deepEqual(init.headers, preflight.headers);
    }
  });
}

for (const status of [403, 404]) {
  test(`ordinary monitoring fails ${status} immediately`, async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response("denied", { status }));
    await assert.rejects(fetchWithRetry(base, path, preflight), new RegExp(`OPTIONS /v1/osm.pmtiles returned HTTP ${status}`));
    assert.equal(fetch.mock.callCount(), 1);
  });

  test(`persistent rollout ${status} still fails within its deadline`, async (t) => {
    let now = 0;
    t.mock.method(Date, "now", () => now);
    const fetch = t.mock.method(globalThis, "fetch", async () => {
      now += 1_000;
      return new Response("still denied", { status });
    });
    t.mock.method(console, "warn", () => {});
    await assert.rejects(fetchWithRetry(base, path, preflight, {
      allowRolloutStatuses: true, verificationTimeoutMs: 2_500, retryDelayMs: 0,
    }), new RegExp(`HTTP ${status}`));
    assert.equal(fetch.mock.callCount(), 3);
  });
}

test("rollout mode does not retry other client errors", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => new Response("bad request", { status: 400 }));
  await assert.rejects(fetchWithRetry(base, path, preflight, { allowRolloutStatuses: true }), /HTTP 400/);
  assert.equal(fetch.mock.callCount(), 1);
});
