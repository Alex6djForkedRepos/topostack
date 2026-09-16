import { terrainPng } from "./terrain-fixture";
import { afterEach, describe, expect, it, vi } from "vitest";
import { env as workerEnv } from "cloudflare:workers";
import worker from "../src/index";

const env = { ...workerEnv, GEOCODER_API_KEY: "test-provider-key" } as unknown as Env;
const jobs: Promise<unknown>[] = [];
const context = { waitUntil: (job: Promise<unknown>) => { jobs.push(job); } } as ExecutionContext;
const request = (path: string, init?: RequestInit) => new Request(`https://example.test${path}`, init);
const png = terrainPng;

afterEach(async () => {
  await Promise.all(jobs.splice(0));
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("cache failure isolation", () => {
  it.each(["terrain", "geocoder"])("serves healthy %s data when cache reads and writes fail", async (source) => {
    vi.spyOn(env.MAP_CACHE, "get").mockRejectedValue(new Error("storage down"));
    vi.spyOn(env.MAP_CACHE, "put").mockRejectedValue(new Error("storage down"));
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => source === "terrain"
      ? new Response(png.slice(), { headers: { "content-type": "image/png" } })
      : Response.json({ results: [{ formatted: "Test place", lat: 1, lon: 2 }] })));
    const response = await worker.fetch(request(source === "terrain" ? "/v1/terrain/0/0/0.png" : "/v1/geocode?q=cache-failure"), env, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-topostack-cache")).toBe("MISS");
    await response.arrayBuffer();
    await Promise.all(jobs);
    expect(log.mock.calls.map(([line]) => JSON.parse(line))).toEqual([
      { message: "cache_failed", operation: "read", source },
      { message: "cache_failed", operation: "write", source },
    ]);
  });

  it("repairs corrupted legacy terrain cache entries", async () => {
    const key = `terrain/${env.DATASET_VERSION}/terrarium/1/1/1.png`;
    await env.MAP_CACHE.put(key, "corrupt", { httpMetadata: { contentType: "image/png" } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(png.slice(), { headers: { "content-type": "image/png" } })));
    const response = await worker.fetch(request("/v1/terrain/1/1/1.png"), env, context);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-topostack-cache")).toBe("MISS");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    await Promise.all(jobs);
    expect((await env.MAP_CACHE.head(key))?.customMetadata?.terrainValidation).toBe("png-v1");
  });

  it("does not cache an invalid PNG even when its MIME type is correct", async () => {
    vi.spyOn(env.MAP_CACHE, "get").mockResolvedValue(null);
    const put = vi.spyOn(env.MAP_CACHE, "put");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(png.slice(0, -1), { headers: { "content-type": "image/png" } })));
    const response = await worker.fetch(request("/v1/terrain/1/0/1.png"), env, context);
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(put).not.toHaveBeenCalled();
  });

  it("revalidates cached terrain and never advertises immutable public URLs", async () => {
    const key = `terrain/${env.DATASET_VERSION}/terrarium/1/0/0.png`;
    const stored = await env.MAP_CACHE.put(key, png.slice(), { httpMetadata: { contentType: "image/png" } });
    const upstream = vi.fn(); vi.stubGlobal("fetch", upstream);
    const response = await worker.fetch(request("/v1/terrain/1/0/0.png", { headers: { "if-none-match": stored!.httpEtag } }), env, context);
    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe(stored!.httpEtag);
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600, must-revalidate");
    expect(await response.text()).toBe("");
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([null, {}, { message: "provider error" }])("does not cache malformed geocoder successes: %j", async (payload) => {
    vi.spyOn(env.MAP_CACHE, "get").mockResolvedValue(null);
    const put = vi.spyOn(env.MAP_CACHE, "put");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(payload)));
    const response = await worker.fetch(request("/v1/geocode?q=invalid-provider"), env, context);
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(put).not.toHaveBeenCalled();
  });

  it("ignores null geocoder entries without losing valid results", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ results: [null, 3, { formatted: "Valid", lat: 1, lon: 2 }] })));
    const response = await worker.fetch(request("/v1/geocode?q=null-results"), env, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([{ display_name: "Valid" }]);
  });

  it("cancels oversized streaming bodies and does not store them", async () => {
    vi.spyOn(env.MAP_CACHE, "get").mockResolvedValue(null);
    const put = vi.spyOn(env.MAP_CACHE, "put");
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(256_001)); }, cancel,
    }))));
    const response = await worker.fetch(request("/v1/geocode?q=oversized-stream"), env, context);
    expect(response.status).toBe(502);
    expect(cancel).toHaveBeenCalledOnce();
    expect(put).not.toHaveBeenCalled();
  });
});

describe("archive replacement consistency", () => {
  it("advertises registered survey routes and attribution in the public manifest", async () => {
    const response = await worker.fetch(request("/v1/manifest"), env, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ datasetVersion: env.DATASET_VERSION, sources: expect.arrayContaining([
      expect.objectContaining({ name: "NOAA NCEI Great Lakes Bathymetry", archive: "/v1/bathymetry/noaa-great-lakes-v1.pmtiles", attribution: expect.any(String) }),
      expect.objectContaining({ name: "swisstopo swissBATHY3D", archive: "/v1/bathymetry/swissbathy3d-v1.pmtiles", attribution: expect.any(String) }),
    ]) });
  });

  it("reports archive storage outages as not-ready with dependency detail", async () => {
    vi.spyOn(env.VECTOR_DATA, "head").mockRejectedValue(new Error("storage unavailable"));
    const response = await worker.fetch(request("/ready"), env, context);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "not_ready", dependencies: {
      vectorData: { status: "unavailable" }, lakeData: { status: "unavailable" },
    } });
  });

  it("recomputes suffix ranges against the replacement object", async () => {
    const key = "osm/current.pmtiles";
    await env.VECTOR_DATA.put(key, new Uint8Array(256));
    const originalHead = env.VECTOR_DATA.head.bind(env.VECTOR_DATA);
    const head = vi.spyOn(env.VECTOR_DATA, "head").mockImplementationOnce(async (key: string) => {
      const old = await originalHead(key);
      await env.VECTOR_DATA.put(key, new Uint8Array([10, 20, 30, 40]));
      return old;
    });
    const response = await worker.fetch(request("/v1/osm.pmtiles", { headers: { range: "bytes=-2" } }), env, context);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-3/4");
    expect(response.headers.get("content-length")).toBe("2");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([30, 40]));
    expect(head).toHaveBeenCalledTimes(2);
  });

  it("bounds retries when an archive keeps changing", async () => {
    const key = "osm/current.pmtiles";
    await env.VECTOR_DATA.put(key, new Uint8Array(10));
    const originalHead = env.VECTOR_DATA.head.bind(env.VECTOR_DATA);
    let generation = 0;
    const head = vi.spyOn(env.VECTOR_DATA, "head").mockImplementation(async (key: string) => {
      const old = await originalHead(key);
      await env.VECTOR_DATA.put(key, new Uint8Array(10).fill(++generation));
      return old;
    });
    const response = await worker.fetch(request("/v1/osm.pmtiles", { headers: { range: "bytes=0-2" } }), env, context);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("1");
    expect(head).toHaveBeenCalledTimes(2);
  });

  it("does not cache range errors or missing archives and permits CORS revalidation", async () => {
    await env.VECTOR_DATA.put("osm/current.pmtiles", new Uint8Array(10));
    const error = await worker.fetch(request("/v1/osm.pmtiles", { headers: { range: "bytes=20-22" } }), env, context);
    expect(error.status).toBe(416);
    expect(error.headers.get("cache-control")).toBe("no-store");
    expect(error.headers.get("content-range")).toBe("bytes */10");
    const preflight = await worker.fetch(request("/v1/osm.pmtiles", { method: "OPTIONS", headers: { origin: "https://runtime.atomm.com", "access-control-request-headers": "if-none-match" } }), env, context);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("if-none-match");
    const head = await worker.fetch(request("/v1/unknown", { method: "HEAD" }), env, context);
    expect(head.status).toBe(404);
    expect(head.headers.get("cache-control")).toBe("no-store");
    expect(await head.text()).toBe("");
  });
});
