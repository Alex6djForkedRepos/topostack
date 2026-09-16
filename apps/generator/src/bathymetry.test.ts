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
    expect(mocks.getZxy).toHaveBeenCalledExactlyOnceWith(fixture.tile.z, fixture.tile.x, fixture.tile.y, expect.any(AbortSignal));
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

// These PNGs come from the independently built, checksum-pinned survey archives.
import craterFixture from "./fixtures/usgs-crater-z14.json";
import swissFixture from "./fixtures/swiss-zug-z14.json";
import { applySurveyProvenance, loadLakeBathymetry } from "./bathymetry";
import { createSyntheticSource, DEFAULT_PROJECT } from "@topostack/core";

const dimensions = { widthMm: 2, heightMm: 2 };
const surveyLake: WaterAreaV1 = { id: "survey-lake", kind: "lake", polygon: { outer: [{ x: -2, y: -2 }, { x: 2, y: -2 }, { x: 2, y: 2 }, { x: -2, y: 2 }], holes: [] } };
const grid = { width: 3, height: 3, values: new Float32Array(9), min: 0, max: 0 };
function surveyArchive(dataset: string, fixture: string, elevation = false) {
  mocks.getHeader.mockResolvedValue({ tileType: 2, minZoom: 0, maxZoom: 14 });
  mocks.getMetadata.mockResolvedValue({ topostack_dataset: dataset, topostack_encoding: elevation ? "elevation-terrarium-v1" : "depth-terrarium-v1" });
  mocks.getZxy.mockResolvedValue({ data: Uint8Array.from(readFileSync(new URL(`./fixtures/${fixture}.png`, import.meta.url))).buffer });
}

describe("multiple lake survey providers", () => {
  it("loads measured Crater Lake depths even without a lake name", async () => {
    surveyArchive(craterFixture.dataset, "usgs-crater-z14");
    const result = await loadLakeBathymetry("", craterFixture.bounds, grid, 14, [surveyLake], undefined, dimensions);
    expect(result.status).toBe("available");
    expect(result.datasetVersions).toEqual([craterFixture.dataset]);
    result.areas[0]!.bathymetry!.depthsM.forEach((v, i) => expect(v).toBeCloseTo(craterFixture.expectedValues[i]!, 3));
    expect(result.attribution[0]!.name).toContain("USGS Crater Lake");
  });

  it("converts Swiss bed elevations using each lake's surface without extra tile requests", async () => {
    surveyArchive(swissFixture.dataset, "swiss-zug-z14", true);
    const lakes = [{ ...surveyLake, surfaceElevationM: 414 }, { ...surveyLake, id: "second", surfaceElevationM: 420 }];
    const result = await loadLakeBathymetry("", swissFixture.bounds, grid, 14, lakes, undefined, dimensions);
    expect(result.status).toBe("available");
    expect(mocks.getZxy).toHaveBeenCalledTimes(1);
    result.areas[0]!.bathymetry!.depthsM.forEach((v, i) => expect(v).toBeCloseTo(414 - swissFixture.expectedValues[i]!, 3));
    expect(result.areas[1]!.bathymetry!.depthsM[0]! - result.areas[0]!.bathymetry!.depthsM[0]!).toBeCloseTo(6);
  });

  it("does not invent a surface elevation when elevation-grid metadata is missing", async () => {
    surveyArchive(swissFixture.dataset, "swiss-zug-z14", true);
    const result = await loadLakeBathymetry("", swissFixture.bounds, grid, 14, [surveyLake], undefined, dimensions);
    expect(result.status).toBe("unavailable");
    expect(result.datasetVersions).toEqual([]);
    expect(result.areas[0]!.bathymetry).toBeUndefined();
  });

  it("does not claim coverage for a neighboring lake or an island", async () => {
    surveyArchive(craterFixture.dataset, "usgs-crater-z14");
    const lakeWithHole = { ...surveyLake, polygon: { outer: surveyLake.polygon.outer, holes: [surveyLake.polygon.outer] } };
    const result = await loadLakeBathymetry("", craterFixture.bounds, grid, 14, [lakeWithHole], undefined, dimensions);
    expect(result.status).toBe("not-covered");
    expect(result.attribution).toEqual([]);
  });

  it("removes stale survey attribution after a failed retry", async () => {
    surveyArchive(craterFixture.dataset, "usgs-crater-z14");
    const result = await loadLakeBathymetry("", craterFixture.bounds, grid, 14, [surveyLake], undefined, dimensions);
    const source = applySurveyProvenance(createSyntheticSource(DEFAULT_PROJECT), result);
    expect(source.datasetVersion).toContain(craterFixture.dataset);
    const failed = applySurveyProvenance(source, { areas: [], status: "unavailable", datasetVersions: [], attribution: [] });
    expect(failed.datasetVersion).not.toContain(craterFixture.dataset);
    expect(failed.attribution.some((a) => a.name.includes("USGS"))).toBe(false);
  });

  it("retains NOAA coverage when the overlapping regional provider is unavailable", async () => {
    mocks.createArchive.mockImplementation((url: string) => {
      if (url.includes("mn-dnr")) throw new Error("offline");
      return mocks;
    });
    const result = await loadLakeBathymetry("", { west: -92, east: -91.99, south: 46.7, north: 46.71 }, grid, 11,
      [{ ...surveyLake, hylakId: 5 }], undefined, dimensions);
    expect(result.status).toBe("partial");
    expect(result.datasetVersions).toEqual(["noaa-great-lakes-v1"]);
    expect(result.areas[0]!.bathymetry).toBeDefined();
  });
});
