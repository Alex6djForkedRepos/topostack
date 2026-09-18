import { afterEach, expect, it, vi } from "vitest";
import { env as workerEnv } from "cloudflare:workers";
import worker from "../src/index";
import { outlineReadiness, OUTLINE_INDEX_KEY } from "../src/routes/lake-outlines";
import release from "../../../scripts/data/lake-outlines-release.json";
import { setEdgeCacheEnabled } from "../src/edge-cache";

const env = workerEnv as Env;
const jobs: Promise<unknown>[] = [];
const createExecutionContext = () => ({ waitUntil: (job: Promise<unknown>) => { jobs.push(job); }, passThroughOnException: () => {} }) as unknown as ExecutionContext;
const settle = async () => { await Promise.all(jobs.splice(0)); };
const sha = "a".repeat(64), file = `${sha.slice(0, 24)}.json`, key = `lake-outlines/${file}`;
const body = '{"type":"FeatureCollection","features":[]}';
const request = (path = file, init?: RequestInit) => new Request(`https://outlines.test/v1/lake-outlines/${path}`, init);
afterEach(() => { setEdgeCacheEnabled(false); vi.restoreAllMocks(); });

it("streams R2 JSON with immutable caching, CORS, HEAD and validators", async () => {
  await env.VECTOR_DATA.put(key, body, { customMetadata: { sha256: sha } });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request(file, { headers: { origin: "http://localhost:5273" } }), env, ctx);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("immutable");
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(await response.text()).toBe(body);
  const head = await worker.fetch(request(file, { method: "HEAD" }), env, ctx);
  expect(await head.text()).toBe("");
  expect(head.headers.get("content-length")).toBe(String(body.length));
  const conditional = await worker.fetch(request(file, { headers: { "if-none-match": response.headers.get("etag")! } }), env, ctx);
  expect(conditional.status).toBe(304);
  expect(await conditional.text()).toBe("");
  await settle();
});

it("serves cached immutable objects without another R2 read", async () => {
  setEdgeCacheEnabled(true);
  await env.VECTOR_DATA.put(key, body, { customMetadata: { sha256: sha } });
  const ctx = createExecutionContext();
  const first = await worker.fetch(request(), env, ctx);
  await first.text(); await settle();
  const hit = await worker.fetch(request(), env, createExecutionContext());
  expect(hit.headers.get("x-topostack-cache")).toBe("EDGE");
  expect(hit.headers.get("x-topostack-r2-reads")).toBe("0");
  expect(await hit.text()).toBe(body);
});

it("rejects missing, malformed and unverified objects without caching errors", async () => {
  await env.VECTOR_DATA.delete(key);
  for (const path of [file, "index.json", "private.json", `${"a".repeat(25)}.json`]) {
    const response = await worker.fetch(request(path), env, createExecutionContext());
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).not.toContain("immutable");
    await response.text();
  }
  await env.VECTOR_DATA.put(key, body);
  const invalid = await worker.fetch(request(), env, createExecutionContext());
  expect(invalid.status).toBe(503); await invalid.text();
});

it("requires the exact pinned index metadata for readiness", async () => {
  await env.VECTOR_DATA.delete(OUTLINE_INDEX_KEY);
  expect(await outlineReadiness(env.VECTOR_DATA)).toBe(false);
  await env.VECTOR_DATA.put(OUTLINE_INDEX_KEY, new Uint8Array(release.index.bytes));
  expect(await outlineReadiness(env.VECTOR_DATA)).toBe(false);
  await env.VECTOR_DATA.put(OUTLINE_INDEX_KEY, new Uint8Array(release.index.bytes), { customMetadata: { sha256: release.index.sha256 } });
  expect(await outlineReadiness(env.VECTOR_DATA)).toBe(true);
});


it("redirects former static URLs so existing browser sessions survive the migration", async () => {
  for (const [oldFile, newFile] of [["index.json", release.index.file], [file, file]]) {
    const response = await worker.fetch(new Request(`https://outlines.test/data/lake-outlines/${oldFile}`), env, createExecutionContext());
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`/v1/lake-outlines/${newFile}`);
  }
});
