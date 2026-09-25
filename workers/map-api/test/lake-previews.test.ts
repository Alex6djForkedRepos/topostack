import { afterEach, expect, it } from "vitest";
import { env as workerEnv } from "cloudflare:workers";
import worker from "../src/index";
import { setEdgeCacheEnabled } from "../src/edge-cache";

const env = workerEnv as Env;
const jobs: Promise<unknown>[] = [];
const createExecutionContext = () => ({ waitUntil: (job: Promise<unknown>) => { jobs.push(job); }, passThroughOnException: () => {} }) as unknown as ExecutionContext;
const settle = async () => { await Promise.all(jobs.splice(0)); };
const sha = "b".repeat(64), file = `${sha.slice(0, 24)}.webp`, key = `lake-previews/${file}`;
const body = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
const request = (path = file, init?: RequestInit) => new Request(`https://previews.test/v1/lake-previews/${path}`, init);
afterEach(() => { setEdgeCacheEnabled(false); });

it("serves previews from R2 as immutable WebP with validators", async () => {
  await env.VECTOR_DATA.put(key, body, { customMetadata: { sha256: sha } });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request(), env, ctx);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("image/webp");
  expect(response.headers.get("cache-control")).toContain("immutable");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(body);
  const conditional = await worker.fetch(request(file, { headers: { "if-none-match": response.headers.get("etag")! } }), env, ctx);
  expect(conditional.status).toBe(304);
  await conditional.text();
  await settle();
});

it("rejects missing, malformed and unverified previews without caching errors", async () => {
  await env.VECTOR_DATA.delete(key);
  for (const path of [file, `${sha.slice(0, 24)}.png`, `${"b".repeat(64)}.webp`, "latest.webp"]) {
    const response = await worker.fetch(request(path), env, createExecutionContext());
    expect(response.status, path).toBe(404);
    expect(response.headers.get("cache-control")).not.toContain("immutable");
    await response.text();
  }
  await env.VECTOR_DATA.put(key, body, { customMetadata: { sha256: "c".repeat(64) } });
  const mismatched = await worker.fetch(request(), env, createExecutionContext());
  expect(mismatched.status).toBe(503);
  await mismatched.text();
});
