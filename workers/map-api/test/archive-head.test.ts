import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env as workerEnv } from "cloudflare:workers";
import worker from "../src/index";
import { archiveHead, resetArchiveHeadCache } from "../src/archive-head";

const logicalKey = "osm/current.pmtiles", pointerKey = `releases/${logicalKey}.json`;
const digest = "a".repeat(64), objectKey = `archives/${digest}/12345678-1234-1234-1234-123456789abc.pmtiles`;
const context = { waitUntil: vi.fn() } as unknown as ExecutionContext;
const env = { ...workerEnv, GEOCODER_API_KEY: "configured" } as unknown as Env;
async function seed() {
  await env.VECTOR_DATA.put(logicalKey, new Uint8Array(127).fill(1));
  const head = await env.VECTOR_DATA.put(objectKey, new Uint8Array(128).fill(2));
  const release = { schemaVersion: 1, logicalKey, objectKey, dataset: "fixture", sha256: digest, bytes: 128, etag: head!.httpEtag, verifiedAt: "2026-09-16T00:00:00Z" };
  await env.VECTOR_DATA.put(pointerKey, JSON.stringify(release));
  return release;
}
beforeEach(() => resetArchiveHeadCache());
afterEach(async () => { await env.VECTOR_DATA.delete(pointerKey); vi.restoreAllMocks(); });

describe("verified archive releases", () => {
  it("serves the promoted object through the existing public route", async () => {
    await seed();
    const response = await worker.fetch(new Request("https://example.test/v1/osm.pmtiles", { headers: { range: "bytes=0-2" } }), env, context);
    expect(response.status).toBe(206); expect(response.headers.get("content-range")).toBe("bytes 0-2/128");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([2, 2, 2]));
  });
  it("keeps legacy deployments working until activation", async () => {
    await env.VECTOR_DATA.put(logicalKey, new Uint8Array(127));
    expect((await archiveHead(env.VECTOR_DATA, logicalKey)).key).toBe(logicalKey);
  });
  it("fails closed when the promoted object changes, without reverting to old data", async () => {
    await seed(); await env.VECTOR_DATA.put(objectKey, new Uint8Array(128).fill(9));
    await expect(archiveHead(env.VECTOR_DATA, logicalKey)).rejects.toThrow("changed");
    const response = await worker.fetch(new Request("https://example.test/ready"), env, context);
    expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ dependencies: { vectorData: { status: "unavailable" } } });
  });
  it("rejects pointers that escape the verified archive prefix or identify a different source", async () => {
    const release = await seed();
    for (const patch of [{ objectKey: "private/file" }, { logicalKey: "lakes/current.pmtiles" }, { sha256: "invalid" }, { bytes: 0 }, { etag: 'W/"weak"' }]) {
      await env.VECTOR_DATA.put(pointerKey, JSON.stringify({ ...release, ...patch }));
      await expect(archiveHead(env.VECTOR_DATA, logicalKey)).rejects.toThrow();
    }
  });
  it("rejects oversized pointers before parsing", async () => {
    await env.VECTOR_DATA.put(pointerKey, " ".repeat(16_385));
    await expect(archiveHead(env.VECTOR_DATA, logicalKey)).rejects.toThrow("size limit");
  });
});
