import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchSeoResponse } from "../verify-seo-http.mjs";

for (const status of [404, 429, 503]) {
  test(`deployment SEO retries a transient ${status}`, async (t) => {
    const responses = [new Response("not ready", { status }), new Response("ready")];
    const fetch = t.mock.method(globalThis, "fetch", async () => responses.shift());
    const response = await fetchSeoResponse("https://ci.invalid/guide", { deadline: Date.now() + 1_000, retryDelayMs: 0 });
    assert.equal(response.status, 200);
    assert.equal(fetch.mock.callCount(), 2);
    assert.equal(fetch.mock.calls[0].arguments[1].redirect, "manual");
  });
}

for (const [name, status, options] of [
  ["ordinary verification remains immediate", 404, {}],
  ["persistent missing pages fail when the window expires", 404, { deadline: Date.now() - 1 }],
  ["intentional 404 checks are not retried", 404, { expectedStatus: 404, deadline: Infinity }],
  ["authorization errors are not retried", 403, { deadline: Infinity }],
  ["unexpected redirects are not followed or retried", 307, { deadline: Infinity }],
  ["permanent redirects keep their status", 308, { expectedStatus: 308, deadline: Infinity }],
]) {
  test(name, async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", async () => new Response("response", { status }));
    assert.equal((await fetchSeoResponse("https://ci.invalid/guide", options)).status, status);
    assert.equal(fetch.mock.callCount(), 1);
  });
}
