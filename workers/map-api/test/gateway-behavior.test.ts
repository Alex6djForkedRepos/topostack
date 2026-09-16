import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env as workerEnv } from "cloudflare:workers";
import worker from "../src/index";
import { ARCHIVE_HEAD_TTL_MS, cachedArchiveHead, resetArchiveHeadCache } from "../src/archive-release";
import { terrainPng } from "./terrain-fixture";

const env = { ...workerEnv, GEOCODER_API_KEY: "test-provider-key" } as unknown as Env;
const jobs: Promise<unknown>[] = [];
const context = { waitUntil: (job: Promise<unknown>) => { jobs.push(job); }, passThroughOnException: () => {} } as unknown as ExecutionContext;
const allowedOrigin = "http://localhost:5273";
const request = (path: string, init: RequestInit = {}) => new Request(`https://example.test${path}`, { ...init, headers: { origin: allowedOrigin, ...(init.headers as Record<string, string> | undefined) } });
const denyAll = () => ({ limit: vi.fn(async (_options: RateLimitOptions) => ({ success: false })) });
const terrainKey = (path: string) => `terrain/${env.DATASET_VERSION}/terrarium/${path}.png`;
const current = { terrainValidation: "png-v1", provenance: "v2" };

async function seedRelease(logicalKey: string, fill: number) {
  const digest = "b".repeat(64);
  const objectKey = `archives/${digest}/12345678-1234-1234-1234-123456789abc.pmtiles`;
  const head = await env.VECTOR_DATA.put(objectKey, new Uint8Array(200).fill(fill));
  const release = { schemaVersion: 1, logicalKey, objectKey, dataset: "fixture", sha256: digest, bytes: 200, etag: head!.httpEtag, verifiedAt: "2026-09-16T00:00:00Z" };
  await env.VECTOR_DATA.put(`releases/${logicalKey}.json`, JSON.stringify(release));
  return { objectKey, etag: head!.httpEtag };
}

function expectCors(response: Response) {
  expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
  expect(response.headers.get("access-control-expose-headers")).toContain("content-range");
  expect(response.headers.get("access-control-expose-headers")).toContain("etag");
}

beforeEach(() => resetArchiveHeadCache());
afterEach(async () => {
  await Promise.all(jobs.splice(0));
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("PMTiles archive releases", () => {
  const logicalKey = "lakes/current.pmtiles";
  afterEach(async () => { await env.VECTOR_DATA.delete(`releases/${logicalKey}.json`); });

  it.each([["malformed JSON", "{not json"], ["an escaped object key", JSON.stringify({ schemaVersion: 1, logicalKey, objectKey: "private/file" })], ["an oversized pointer", " ".repeat(16_385)]])(
    "answers %s with a retryable 503 instead of a generic 500", async (_label, pointer) => {
      await env.VECTOR_DATA.put(`releases/${logicalKey}.json`, pointer);
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const response = await worker.fetch(request("/v1/lakes.pmtiles", { headers: { range: "bytes=0-10" } }), env, context);
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("30");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({ error: expect.stringContaining("temporarily unavailable") });
      expect(log.mock.calls.map(([line]) => JSON.parse(String(line)))).toContainEqual(expect.objectContaining({ message: "archive_release_invalid", key: logicalKey }));
    });

  it("serves a promoted HRDEM terrain release and revalidates it with 304", async () => {
    const hrdemKey = "terrain-sources/nrcan-hrdem-alexander-v1.pmtiles";
    const { etag } = await seedRelease(hrdemKey, 7);
    try {
      const ranged = await worker.fetch(request(`/v1/${hrdemKey}`, { headers: { range: "bytes=0-9" } }), env, context);
      expect(ranged.status).toBe(206);
      expect(ranged.headers.get("content-range")).toBe("bytes 0-9/200");
      expect(ranged.headers.get("etag")).toBe(etag);
      expect(new Uint8Array(await ranged.arrayBuffer())).toEqual(new Uint8Array(10).fill(7));
      const revalidated = await worker.fetch(request(`/v1/${hrdemKey}`, { headers: { "if-none-match": etag } }), env, context);
      expect(revalidated.status).toBe(304);
      expect(revalidated.headers.get("etag")).toBe(etag);
      expectCors(revalidated);
    } finally {
      await env.VECTOR_DATA.delete(`releases/${hrdemKey}.json`);
    }
  });

  it("memoizes release resolution so repeated range reads cost one R2 read", async () => {
    await seedRelease(logicalKey, 3);
    const reads = [];
    for (let index = 0; index < 3; index += 1) {
      const response = await worker.fetch(request("/v1/lakes.pmtiles", { headers: { range: `bytes=${index}-${index}` } }), env, context);
      expect(response.status).toBe(206);
      await response.arrayBuffer();
      reads.push(response.headers.get("x-topostack-r2-reads"));
    }
    // Pointer get + object head + ranged get, then only the ranged get.
    expect(reads).toEqual(["3", "1", "1"]);
  });

  it("expires memoized heads after the TTL and re-resolves replaced objects", async () => {
    await env.VECTOR_DATA.put(logicalKey, new Uint8Array(150).fill(1));
    const head = vi.spyOn(env.VECTOR_DATA, "head");
    await cachedArchiveHead(env.VECTOR_DATA, logicalKey, 1_000);
    await cachedArchiveHead(env.VECTOR_DATA, logicalKey, 1_000 + ARCHIVE_HEAD_TTL_MS - 1);
    expect(head).toHaveBeenCalledTimes(1);
    await cachedArchiveHead(env.VECTOR_DATA, logicalKey, 1_000 + ARCHIVE_HEAD_TTL_MS);
    expect(head).toHaveBeenCalledTimes(2);

    await worker.fetch(request("/v1/lakes.pmtiles", { headers: { range: "bytes=0-0" } }), env, context).then((response) => response.arrayBuffer());
    await env.VECTOR_DATA.put(logicalKey, new Uint8Array(40).fill(9));
    const replaced = await worker.fetch(request("/v1/lakes.pmtiles", { headers: { range: "bytes=-2" } }), env, context);
    expect(replaced.status).toBe(206);
    expect(replaced.headers.get("content-range")).toBe("bytes 38-39/40");
    expect(new Uint8Array(await replaced.arrayBuffer())).toEqual(new Uint8Array([9, 9]));
  });
});

describe("archive range errors", () => {
  beforeEach(async () => { await env.VECTOR_DATA.put("osm/current.pmtiles", new Uint8Array(32 * 1024 * 1024)); });

  it("answers oversized ranges with 413, unsatisfiable ranges with 416, both with CORS", async () => {
    const tooLarge = await worker.fetch(request("/v1/osm.pmtiles", { headers: { range: "bytes=0-16777216" } }), env, context);
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.headers.has("content-range")).toBe(false);
    expectCors(tooLarge);
    const unsatisfiable = await worker.fetch(request("/v1/osm.pmtiles", { headers: { range: "bytes=99999999-" } }), env, context);
    expect(unsatisfiable.status).toBe(416);
    expect(unsatisfiable.headers.get("content-range")).toBe(`bytes */${32 * 1024 * 1024}`);
    expectCors(unsatisfiable);
    const partial = await worker.fetch(request("/v1/osm.pmtiles", { headers: { range: "bytes=0-3" } }), env, context);
    expect(partial.status).toBe(206);
    expect(partial.headers.get("x-topostack-cache")).toBe("R2");
    expectCors(partial);
    await partial.arrayBuffer();
  });
});

describe("request budgets", () => {
  it("does not charge archive ranges or terrain cache hits, but limits upstream misses", async () => {
    const limiter = denyAll();
    const limitedEnv = { ...env, REQUEST_LIMITER: limiter } as unknown as Env;
    await env.VECTOR_DATA.put("osm/current.pmtiles", new Uint8Array(64));
    for (let index = 0; index < 20; index += 1) {
      const response = await worker.fetch(request("/v1/osm.pmtiles", { headers: { range: `bytes=${index}-${index}` } }), limitedEnv, context);
      expect(response.status).toBe(206);
      await response.arrayBuffer();
    }
    await env.MAP_CACHE.put(terrainKey("3/1/1"), terrainPng.slice(), { customMetadata: current });
    const upstream = vi.fn(async () => new Response(terrainPng.slice(), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", upstream);
    const hit = await worker.fetch(request("/v1/terrain/3/1/1.png"), limitedEnv, context);
    expect(hit.status).toBe(200);
    await hit.arrayBuffer();
    expect(limiter.limit).not.toHaveBeenCalled();

    await env.MAP_CACHE.delete(terrainKey("3/1/2"));
    const miss = await worker.fetch(request("/v1/terrain/3/1/2.png"), limitedEnv, context);
    expect(miss.status).toBe(429);
    expect(miss.headers.get("retry-after")).toBe("60");
    expectCors(miss);
    expect(upstream).not.toHaveBeenCalled();
    expect(limiter.limit).toHaveBeenCalledWith({ key: "anonymous:terrain" });

    const manifest = await worker.fetch(request("/v1/manifest"), limitedEnv, context);
    expect(manifest.status).toBe(429);
  });

  it("caps geocoder cache misses with a dedicated shared budget across clients", async () => {
    const allow = vi.fn(async (_options: RateLimitOptions) => ({ success: true }));
    const global = denyAll();
    const budgetEnv = { ...env, REQUEST_LIMITER: { limit: allow }, GEOCODE_LIMITER: { limit: allow }, GEOCODE_GLOBAL_LIMITER: global } as unknown as Env;
    const upstream = vi.fn(async () => Response.json({ results: [{ formatted: "Somewhere", lat: 1, lon: 2 }] }));
    vi.stubGlobal("fetch", upstream);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await worker.fetch(new Request("https://example.test/v1/geocode?q=global%20budget", { headers: { "cf-connecting-ip": "203.0.113.9" } }), budgetEnv, context);
    expect(response.status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
    expect(allow.mock.calls.map(([options]) => options.key)).toEqual(["203.0.113.9:geocode", "203.0.113.9:geocode"]);
    expect(global.limit).toHaveBeenCalledWith({ key: "geocode-global" });
  });

  it("charges unknown paths to one fixed bucket instead of a caller-chosen one", async () => {
    const limit = vi.fn(async (_options: RateLimitOptions) => ({ success: true }));
    const budgetEnv = { ...env, REQUEST_LIMITER: { limit } } as unknown as Env;
    for (const path of ["/v1/terrain", "/v1/geocode/extra", "/nonsense", "/x/random-bucket-123/y"]) {
      const response = await worker.fetch(request(path), budgetEnv, context);
      expect(response.status).toBe(404);
    }
    expect(limit.mock.calls.map(([options]) => options.key)).toEqual(Array(4).fill("anonymous:not-found"));
  });
});

describe("terrain validators and provenance", () => {
  it("returns an etag on a miss that matches the cached copy and answers 304 without reading the body", async () => {
    const key = terrainKey("4/2/2");
    await env.MAP_CACHE.delete(key);
    const upstream = vi.fn(async () => new Response(terrainPng.slice(), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", upstream);
    const miss = await worker.fetch(request("/v1/terrain/4/2/2.png"), env, context);
    expect(miss.status).toBe(200);
    expect(miss.headers.get("x-topostack-cache")).toBe("MISS");
    const etag = miss.headers.get("etag");
    expect(etag).toMatch(/^"[a-f0-9]{32}"$/);
    await miss.arrayBuffer();
    await Promise.all(jobs.splice(0));
    const stored = await env.MAP_CACHE.head(key);
    expect(stored?.httpEtag).toBe(etag);
    expect(stored?.customMetadata).toMatchObject(current);

    const get = vi.spyOn(env.MAP_CACHE, "get");
    const revalidated = await worker.fetch(request("/v1/terrain/4/2/2.png", { headers: { "if-none-match": etag! } }), env, context);
    expect(revalidated.status).toBe(304);
    expect(revalidated.headers.get("etag")).toBe(etag);
    expect(revalidated.headers.get("x-topostack-r2-reads")).toBe("1");
    expect(get).toHaveBeenCalledWith(key, { onlyIf: { etagDoesNotMatch: etag!.slice(1, -1) } });
    expect(await revalidated.text()).toBe("");
    expectCors(revalidated);
    expect(upstream).toHaveBeenCalledOnce();

    // A miss can answer a matching validator too (e.g. after a failed cache write).
    await env.MAP_CACHE.delete(key);
    const missRevalidated = await worker.fetch(request("/v1/terrain/4/2/2.png", { headers: { "if-none-match": etag! } }), env, context);
    expect(missRevalidated.status).toBe(304);
    expect(missRevalidated.headers.get("x-topostack-cache")).toBe("MISS");
  });

  it("refreshes legacy tiles cached without a provenance marker", async () => {
    const key = terrainKey("5/3/3");
    await env.MAP_CACHE.put(key, terrainPng.slice(), { customMetadata: { terrainValidation: "png-v1", dataset: env.DATASET_VERSION, imagerySources: "" } });
    const upstream = vi.fn(async () => new Response(terrainPng.slice(), { headers: { "content-type": "image/png", "x-amz-meta-x-imagery-sources": "srtm/test" } }));
    vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(request("/v1/terrain/5/3/3.png"), env, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-topostack-cache")).toBe("MISS");
    expect(response.headers.get("x-topostack-imagery-sources")).toBe("srtm/test");
    await response.arrayBuffer();
    await Promise.all(jobs.splice(0));
    expect((await env.MAP_CACHE.head(key))?.customMetadata).toMatchObject({ ...current, imagerySources: "srtm/test" });

    const hit = await worker.fetch(request("/v1/terrain/5/3/3.png"), env, context);
    expect(hit.headers.get("x-topostack-cache")).toBe("HIT");
    expect(hit.headers.get("x-topostack-imagery-sources")).toBe("srtm/test");
    await hit.arrayBuffer();
    expect(upstream).toHaveBeenCalledOnce();
  });

  it("keeps serving a validated legacy tile when its refresh cannot reach the origin", async () => {
    const key = terrainKey("5/3/4");
    await env.MAP_CACHE.put(key, terrainPng.slice(), { customMetadata: { terrainValidation: "png-v1", dataset: env.DATASET_VERSION } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const response = await worker.fetch(request("/v1/terrain/5/3/4.png"), env, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-topostack-cache")).toBe("STALE");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(terrainPng);
  });

  it("truncates long provenance identically on misses and hits", async () => {
    const key = terrainKey("5/3/5");
    await env.MAP_CACHE.delete(key);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(terrainPng.slice(), { headers: { "content-type": "image/png", "x-imagery-sources": "s".repeat(2500) } })));
    const miss = await worker.fetch(request("/v1/terrain/5/3/5.png"), env, context);
    await miss.arrayBuffer();
    await Promise.all(jobs.splice(0));
    const hit = await worker.fetch(request("/v1/terrain/5/3/5.png"), env, context);
    await hit.arrayBuffer();
    expect(miss.headers.get("x-topostack-imagery-sources")).toHaveLength(1900);
    expect(hit.headers.get("x-topostack-imagery-sources")).toBe(miss.headers.get("x-topostack-imagery-sources"));
  });

  it("answers HEAD on an uncached terrain tile without contacting the origin or writing R2", async () => {
    const key = terrainKey("6/1/2");
    await env.MAP_CACHE.delete(key);
    const upstream = vi.fn(async () => new Response(terrainPng.slice(), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", upstream);
    const limiter = denyAll();
    const response = await worker.fetch(request("/v1/terrain/6/1/2.png", { method: "HEAD" }), { ...env, REQUEST_LIMITER: limiter } as unknown as Env, context);
    await Promise.all(jobs.splice(0));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-topostack-cache")).toBe("MISS");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toBeNull();
    expect(await response.text()).toBe("");
    expectCors(response);
    expect(upstream).not.toHaveBeenCalled();
    expect(limiter.limit).not.toHaveBeenCalled();
    expect(await env.MAP_CACHE.head(key)).toBeNull();
  });

  it("revalidates HEAD on a cached terrain tile from metadata alone", async () => {
    const key = terrainKey("6/1/3");
    const stored = await env.MAP_CACHE.put(key, terrainPng.slice(), { customMetadata: current });
    const get = vi.spyOn(env.MAP_CACHE, "get");
    const response = await worker.fetch(request("/v1/terrain/6/1/3.png", { method: "HEAD", headers: { "if-none-match": stored!.httpEtag } }), env, context);
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe(stored!.httpEtag);
    expect(get).not.toHaveBeenCalled();
  });

  it("answers HEAD on terrain without a body", async () => {
    await env.MAP_CACHE.put(terrainKey("6/1/1"), terrainPng.slice(), { customMetadata: current });
    const response = await worker.fetch(request("/v1/terrain/6/1/1.png", { method: "HEAD" }), env, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(String(terrainPng.byteLength));
    expect(response.headers.get("etag")).toBeTruthy();
    expect(await response.text()).toBe("");
  });
});

describe("geocoder caching", () => {
  it("does not store empty results and keeps browser caching short", async () => {
    const put = vi.spyOn(env.MAP_CACHE, "put");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ results: [] })));
    const response = await worker.fetch(request("/v1/geocode?q=nowhere%20at%20all"), env, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    await Promise.all(jobs.splice(0));
    expect(put).not.toHaveBeenCalled();
  });

  it("shares one cache entry across case and repeated-whitespace variants", async () => {
    const upstream = vi.fn(async () => Response.json({ results: [{ formatted: "Lake Tahoe", lat: 39, lon: -120 }] }));
    vi.stubGlobal("fetch", upstream);
    const first = await worker.fetch(request("/v1/geocode?q=lake%20%20%20tahoe%20whitespace"), env, context);
    expect(first.headers.get("x-topostack-cache")).toBe("MISS");
    await first.arrayBuffer();
    await Promise.all(jobs.splice(0));
    const second = await worker.fetch(request("/v1/geocode?q=%20Lake%09Tahoe%20%0AWhitespace"), env, context);
    expect(second.headers.get("x-topostack-cache")).toBe("HIT");
    await second.arrayBuffer();
    expect(upstream).toHaveBeenCalledOnce();
    expect(new URL(String((upstream.mock.calls[0] as unknown[])[0])).searchParams.get("text")).toBe("lake tahoe whitespace");
  });

  it("answers HEAD on geocode without a body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ results: [{ formatted: "Head place", lat: 1, lon: 2 }] })));
    const response = await worker.fetch(request("/v1/geocode?q=head%20place", { method: "HEAD" }), env, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.text()).toBe("");
    expectCors(response);
  });
});
