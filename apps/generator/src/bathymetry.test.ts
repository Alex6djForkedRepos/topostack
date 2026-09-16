import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WaterAreaV1 } from "@topostack/core";
import fixture from "./fixtures/noaa-erie-z11.json";
import { hasNoaaCoverage, loadNoaaBathymetry, sampleDepth } from "./bathymetry";

const mocks = vi.hoisted(() => ({ createArchive: vi.fn(), getHeader: vi.fn(), getMetadata: vi.fn(), getZxy: vi.fn() }));
vi.mock("./archive", () => ({ createArchive: mocks.createArchive }));
const lake: WaterAreaV1 = { id: "erie", name: "Lake Erie", kind: "lake", polygon: { outer: [], holes: [] }, maxDepthM: 64 };
const load = (signal?: AbortSignal) => loadNoaaBathymetry("https://example.test", fixture.bounds, 3, 3, 15, [lake], signal);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createArchive.mockReturnValue(mocks);
  mocks.getHeader.mockResolvedValue({ tileType: 2, minZoom: 0, maxZoom: 11 });
  mocks.getMetadata.mockResolvedValue({ topostack_dataset: "noaa-great-lakes-v1", topostack_encoding: "depth-terrarium-v1" });
  const bytes = readFileSync(new URL("./fixtures/noaa-erie-z11.png", import.meta.url));
  mocks.getZxy.mockResolvedValue({ data: Uint8Array.from(bytes).buffer });
});

describe("NOAA bathymetry loading", () => {
  it("decodes a real NOAA tile and aligns pixel centers to the terrain grid", async () => {
    const result = await load();
    expect(result.status).toBe("available");
    expect(mocks.createArchive).toHaveBeenCalledWith("https://example.test/v1/bathymetry/noaa-great-lakes-v1.pmtiles", undefined);
    expect(mocks.getZxy).toHaveBeenCalledExactlyOnceWith(fixture.tile.z, fixture.tile.x, fixture.tile.y, undefined);
    const bathymetry = result.areas[0]!.bathymetry!;
    expect(bathymetry).toMatchObject({ width: 3, height: 3 });
    bathymetry.depthsM.forEach((value, index) => expect(value).toBeCloseTo(fixture.expectedDepthsM[index]!, 4));
    expect(lake.bathymetry).toBeUndefined();
  });

  it("keeps other lakes and oceans on their existing sources without fetching NOAA", async () => {
    const areas = [{ ...lake, name: "Crater Lake" }, { ...lake, kind: "ocean" as const }];
    expect(await loadNoaaBathymetry("", fixture.bounds, 3, 3, 11, areas)).toEqual({ areas, status: "not-covered" });
    expect(mocks.createArchive).not.toHaveBeenCalled();
    expect(hasNoaaCoverage({ ...lake, name: " Lake St. Clair " })).toBe(true);
    expect(hasNoaaCoverage({ ...lake, name: undefined, hylakId: 9 })).toBe(true);
    expect(hasNoaaCoverage({ ...lake, hylakId: 9999 })).toBe(false);
  });

  it("keeps a bounded number of requests for wide selections", async () => {
    mocks.getZxy.mockResolvedValue(undefined);
    const result = await loadNoaaBathymetry("", { west: -93, east: -75, south: 40, north: 50 }, 3, 3, 15, [lake]);
    expect(mocks.getZxy.mock.calls.length).toBeLessThanOrEqual(24);
    expect(result.status).toBe("not-covered");
  });

  it("distinguishes valid empty coverage from unavailable data", async () => {
    mocks.getZxy.mockResolvedValue(undefined);
    expect((await load()).status).toBe("not-covered");
    mocks.getZxy.mockRejectedValue(new Error("offline"));
    const result = await load();
    expect(result).toEqual({ areas: [lake], status: "unavailable" });
  });

  it("rejects a different archive encoding and malformed tiles", async () => {
    mocks.getMetadata.mockResolvedValue({ topostack_encoding: "elevation" });
    expect((await load()).status).toBe("unavailable");
    expect(mocks.getZxy).not.toHaveBeenCalled();
    mocks.getMetadata.mockResolvedValue({ topostack_dataset: "noaa-great-lakes-v1", topostack_encoding: "depth-terrarium-v1" });
    mocks.getZxy.mockResolvedValue({ data: new Uint8Array([1, 2, 3]).buffer });
    expect((await load()).status).toBe("unavailable");
  });

  it("propagates cancellation instead of publishing a fallback result", async () => {
    const controller = new AbortController();
    mocks.getZxy.mockImplementation(() => { controller.abort(); return Promise.resolve(undefined); });
    await expect(load(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not blend missing samples into measured depths", () => {
    expect(sampleDepth((x, y) => x === 0 && y === 0 ? 40 : Number.NaN, 0, 0)).toBe(40);
    expect(sampleDepth((x) => x === 0 ? 40 : Number.NaN, 0.5, 0)).toBeNaN();
    expect(sampleDepth((x, y) => 10 + x * 20 + y * 40, 0.5, 0.5)).toBe(40);
    expect(sampleDepth(() => -20, 0, 0)).toBeNaN();
  });
});
