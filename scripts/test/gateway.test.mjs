import assert from "node:assert/strict";
import test from "node:test";
import { fetchGatewayJson, gatewayOrigin } from "../lib/gateway.mjs";
import { verifyUpstreamHealth } from "../verify-upstream-health.mjs";

const healthy = { status: "healthy", fresh: true, ok: true, probes: [] };

test("gateway origins must be bare HTTPS origins", () => {
  assert.equal(gatewayOrigin("https://topostack.app").origin, "https://topostack.app");
  for (const value of [undefined, "", "not a url", "http://topostack.app", "https://user:pass@example.test",
    "https://example.test/health", "https://example.test/?q=1", "https://example.test/#x"]) {
    assert.throws(() => gatewayOrigin(value), /WORKER_URL must be an HTTPS origin/);
  }
});

test("an HTML error page is reported as a status, never parsed as JSON", async () => {
  const errorPage = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head></html>';
  for (const response of [
    new Response(errorPage, { status: 502, headers: { "content-type": "text/html; charset=UTF-8" } }),
    new Response(errorPage, { status: 200, headers: { "content-type": "text/html; charset=UTF-8" } }),
    new Response("", { status: 200 }),
  ]) {
    await assert.rejects(fetchGatewayJson("https://example.test", "/v1/upstream-health", async () => response),
      (error) => error instanceof Error && !(error instanceof SyntaxError) && /did not return JSON/.test(error.message));
  }
  await assert.rejects(verifyUpstreamHealth("https://example.test", async () => new Response("<html>502</html>", { status: 502, headers: { "content-type": "text/html" } })),
    /did not return JSON: HTTP 502/);
});

test("the upstream probe monitor accepts only fresh healthy results", async () => {
  assert.deepEqual(await verifyUpstreamHealth("https://example.test", async () => Response.json(healthy)), healthy);
  for (const result of [{ ...healthy, status: "degraded" }, { ...healthy, fresh: false }, { ...healthy, ok: false }, {}]) {
    await assert.rejects(verifyUpstreamHealth("https://example.test", async () => Response.json(result)), /Upstream cache-miss probes are unhealthy/);
  }
});

test("the probe is read with no-store and a bounded timeout", async () => {
  const calls = [];
  await verifyUpstreamHealth("https://example.test", async (url, init) => { calls.push([String(url), init]); return Response.json(healthy); });
  assert.equal(calls[0][0], "https://example.test/v1/upstream-health");
  assert.equal(calls[0][1].cache, "no-store");
  assert.ok(calls[0][1].signal instanceof AbortSignal);
});
