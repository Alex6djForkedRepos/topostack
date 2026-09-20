import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { env as workerEnv } from "cloudflare:workers";
import worker from "../src/index";
import { resetArchiveHeadCache } from "../src/archive-head";
import { setEdgeCacheEnabled } from "../src/edge-cache";
import { terrainPng } from "./terrain-fixture";

const env = { ...workerEnv, GEOCODER_API_KEY: "test-provider-key" } as unknown as Env;
const jobs: Promise<unknown>[] = [];
const context = { waitUntil: (job: Promise<unknown>) => { jobs.push(job); }, passThroughOnException: () => {} } as unknown as ExecutionContext;
// A fresh origin per run keeps these entries away from any other cache user.
const origin = `https://edge-${crypto.randomUUID()}.test`;
const request = (path: string, init?: RequestInit) => new Request(`${origin}${path}`, init);
const settle = async () => { await Promise.all(jobs.splice(0)); };

beforeAll(() => setEdgeCacheEnabled(true));
afterAll(() => setEdgeCacheEnabled(false));
beforeEach(() => resetArchiveHeadCache());
afterEach(async () => { await settle(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("terrain edge cache", () => {
  it("serves repeat requests, validators and HEAD probes without R2 or origin reads", async () => {
    const upstream = vi.fn(async () => new Response(terrainPng.slice(), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", upstream);
    const miss = await worker.fetch(request("/v1/terrain/9/100/200.png"), env, context);
    expect(miss.headers.get("x-topostack-cache")).toBe("MISS");
    await miss.arrayBuffer(); await settle();

    const hit = await worker.fetch(request("/v1/terrain/9/100/200.png"), env, context);
    expect(hit.headers.get("x-topostack-cache")).toBe("EDGE");
    expect(hit.headers.get("x-topostack-r2-reads")).toBe("0");
    expect(hit.headers.get("etag")).toBe(miss.headers.get("etag"));
    expect(hit.headers.get("x-topostack-dataset")).toBe(env.DATASET_VERSION);
    expect(new Uint8Array(await hit.arrayBuffer())).toEqual(terrainPng);

    const revalidated = await worker.fetch(request("/v1/terrain/9/100/200.png", { headers: { "if-none-match": miss.headers.get("etag")! } }), env, context);
    expect(revalidated.status).toBe(304);
    expect(revalidated.headers.get("x-topostack-r2-reads")).toBe("0");

    const head = await worker.fetch(request("/v1/terrain/9/100/200.png", { method: "HEAD" }), env, context);
    expect(head.headers.get("x-topostack-cache")).toBe("EDGE");
    expect(head.headers.get("x-topostack-r2-reads")).toBe("0");
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("fills the edge cache from an R2 hit", async () => {
    await env.MAP_CACHE.put(`terrain/${env.DATASET_VERSION}/terrarium/9/101/200.png`, terrainPng.slice(), {
      httpMetadata: { contentType: "image/png" }, customMetadata: { terrainValidation: "png-v1", provenance: "v2" },
    });
    const first = await worker.fetch(request("/v1/terrain/9/101/200.png"), env, context);
    expect(first.headers.get("x-topostack-cache")).toBe("HIT");
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(terrainPng);
    await settle();
    const second = await worker.fetch(request("/v1/terrain/9/101/200.png"), env, context);
    expect(second.headers.get("x-topostack-cache")).toBe("EDGE");
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(terrainPng);
  });

  it("falls back to R2 when the edge cache fails", async () => {
    await env.MAP_CACHE.put(`terrain/${env.DATASET_VERSION}/terrarium/9/102/200.png`, terrainPng.slice(), {
      httpMetadata: { contentType: "image/png" }, customMetadata: { terrainValidation: "png-v1", provenance: "v2" },
    });
    const cache = (caches as unknown as { default: Cache }).default;
    vi.spyOn(cache, "match").mockRejectedValue(new Error("cache down"));
    vi.spyOn(cache, "put").mockRejectedValue(new Error("cache down"));
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await worker.fetch(request("/v1/terrain/9/102/200.png"), env, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-topostack-cache")).toBe("HIT");
    await response.arrayBuffer(); await settle();
    expect(log.mock.calls.map(([line]) => JSON.parse(line as string).message)).toEqual(["edge_cache_failed", "edge_cache_failed"]);
  });
});

describe("archive range edge cache", () => {
  const logicalKey = "osm/current.pmtiles";
  const objectKey = `archives/${"c".repeat(64)}/12345678-1234-1234-1234-123456789abc.pmtiles`;

  beforeEach(async () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, index) => index % 251);
    const head = await env.VECTOR_DATA.put(objectKey, bytes);
    await env.VECTOR_DATA.put(`releases/${logicalKey}.json`, JSON.stringify({ schemaVersion: 1, logicalKey, objectKey, dataset: "fixture", sha256: "c".repeat(64), bytes: 300, etag: head!.httpEtag, verifiedAt: "2026-09-16T00:00:00Z" }));
  });
  afterEach(async () => { await env.VECTOR_DATA.delete(`releases/${logicalKey}.json`); });

  it("answers a repeated range from the edge with the same partial response", async () => {
    const range = { headers: { range: "bytes=10-19" } };
    const first = await worker.fetch(request("/v1/osm.pmtiles", range), env, context);
    expect(first.status).toBe(206);
    const bytes = new Uint8Array(await first.arrayBuffer());
    await settle();
    const second = await worker.fetch(request("/v1/osm.pmtiles", range), env, context);
    expect(second.status).toBe(206);
    expect(second.headers.get("x-topostack-cache")).toBe("EDGE");
    expect(second.headers.get("x-topostack-r2-reads")).toBe("0");
    expect(second.headers.get("content-range")).toBe("bytes 10-19/300");
    expect(second.headers.get("content-length")).toBe("10");
    expect(second.headers.get("etag")).toBe(first.headers.get("etag"));
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(bytes);

    const other = await worker.fetch(request("/v1/osm.pmtiles", { headers: { range: "bytes=20-29" } }), env, context);
    expect(other.headers.get("x-topostack-cache")).toBe("R2");
    await other.arrayBuffer();
  });

  it("never serves an edge copy of a replaced object generation", async () => {
    const range = { headers: { range: "bytes=0-4" } };
    await (await worker.fetch(request("/v1/osm.pmtiles", range), env, context)).arrayBuffer();
    await settle();
    const replaced = await env.VECTOR_DATA.put(objectKey, new Uint8Array(300).fill(7));
    await env.VECTOR_DATA.put(`releases/${logicalKey}.json`, JSON.stringify({ schemaVersion: 1, logicalKey, objectKey, dataset: "fixture", sha256: "c".repeat(64), bytes: 300, etag: replaced!.httpEtag, verifiedAt: "2026-09-17T00:00:00Z" }));
    resetArchiveHeadCache();
    const response = await worker.fetch(request("/v1/osm.pmtiles", range), env, context);
    expect(response.headers.get("x-topostack-cache")).toBe("R2");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(5).fill(7));
  });
});
