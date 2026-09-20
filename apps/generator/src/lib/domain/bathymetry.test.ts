import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WaterAreaV1 } from "@topostack/core";
import fixture from "$lib/domain/fixtures/noaa-erie-z11.json";
import surveyCatalog from "../../../../../scripts/data/lake-bathymetry.json";
import { buildPixelMask, hasNoaaCoverage, loadLakeBathymetry, MASK_YIELD_CELLS, sampleDepth } from "$lib/domain/bathymetry";

const mocks = vi.hoisted(() => ({ createArchive: vi.fn(), getHeader: vi.fn(), getMetadata: vi.fn(), getZxy: vi.fn() }));
vi.mock("$lib/domain/archive", () => ({ createArchive: mocks.createArchive }));
const lake: WaterAreaV1 = { id: "erie", name: "Lake Erie", kind: "lake", polygon: { outer: [], holes: [] }, maxDepthM: 64 };
const smallGrid = { width: 3, height: 3, values: new Float32Array(9), min: 0, max: 0 };
const load = (signal?: AbortSignal) => loadLakeBathymetry("https://example.test", fixture.bounds, smallGrid, 15, [lake], signal);
const requestedNoaa = () => mocks.createArchive.mock.calls.some((call) => String(call[0]).includes("noaa-great-lakes-v1"));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.createArchive.mockReturnValue(mocks);
  mocks.getHeader.mockResolvedValue({ tileType: 2, minZoom: 0, maxZoom: 11 });
  mocks.getMetadata.mockResolvedValue({ topostack_dataset: "noaa-great-lakes-v1", topostack_encoding: "depth-terrarium-v1" });
  const bytes = readFileSync(new URL("./fixtures/noaa-erie-z11.png", import.meta.url));
  mocks.getZxy.mockResolvedValue({ data: Uint8Array.from(bytes).buffer });
});

/** Tile requests per dataset id, so each provider's window can be checked alone. */
const tileRequests = new Map<string, number>();
/**
 * Lake Erie's bbox also intersects the Ontario provider, so a real load asks
 * every overlapping archive. Answer each with the header and metadata its own
 * catalog entry declares, serving the same fixture tile: depths then come from
 * the first provider in registry order (NOAA), exactly as in production.
 */
function serveEveryArchive(): void {
  tileRequests.clear();
  mocks.createArchive.mockImplementation((url: string) => {
    const source = surveyCatalog.sources.find((item) => url.includes(item.id));
    return {
      getHeader: () => Promise.resolve({ tileType: 2, minZoom: 0, maxZoom: source?.maxZoom }),
      getMetadata: () => Promise.resolve({ topostack_dataset: source?.id, topostack_encoding: source?.encoding }),
      getZxy: (...args: unknown[]) => {
        tileRequests.set(source?.id ?? url, (tileRequests.get(source?.id ?? url) ?? 0) + 1);
        return mocks.getZxy(...args);
      },
    };
  });
}

describe("NOAA bathymetry loading", () => {
  beforeEach(serveEveryArchive);

  it("decodes a real NOAA tile and aligns pixel centers to the terrain grid", async () => {
    const result = await load();
    expect(result.status).toBe("available");
    expect(result.datasetVersions[0]).toBe("noaa-great-lakes-v1");
    expect(mocks.createArchive).toHaveBeenCalledWith("https://example.test/v1/bathymetry/noaa-great-lakes-v1.pmtiles", undefined);
    expect(mocks.getZxy).toHaveBeenCalledWith(fixture.tile.z, fixture.tile.x, fixture.tile.y, expect.any(AbortSignal));
    const bathymetry = result.areas[0]!.bathymetry!;
    expect(bathymetry).toMatchObject({ width: 3, height: 3 });
    bathymetry.depthsM.forEach((value, index) => expect(value).toBeCloseTo(fixture.expectedDepthsM[index]!, 4));
    expect(lake.bathymetry).toBeUndefined();
  });

  it("keeps other lakes and oceans off the NOAA archive", async () => {
    const areas = [{ ...lake, name: "Crater Lake" }, { ...lake, id: "sea", kind: "ocean" as const }];
    const result = await loadLakeBathymetry("", fixture.bounds, smallGrid, 11, areas);
    expect(requestedNoaa()).toBe(false);
    expect(result.datasetVersions).not.toContain("noaa-great-lakes-v1");
    expect(result.areas.find((area) => area.kind === "ocean")?.bathymetry).toBeUndefined();
    expect(hasNoaaCoverage({ ...lake, name: " Lake St. Clair " })).toBe(true);
    expect(hasNoaaCoverage({ ...lake, name: undefined, hylakId: 9 })).toBe(true);
    expect(hasNoaaCoverage({ ...lake, hylakId: 9999 })).toBe(false);
  });

  it("keeps a bounded number of requests per provider for wide selections", async () => {
    mocks.getZxy.mockResolvedValue(undefined);
    const result = await loadLakeBathymetry("", { west: -93, east: -75, south: 40, north: 50 }, smallGrid, 15, [lake]);
    // Every overlapping provider caps its own tile window independently.
    expect(tileRequests.size).toBeGreaterThan(0);
    for (const count of tileRequests.values()) expect(count).toBeLessThanOrEqual(24);
    expect(result.status).toBe("not-covered");
  });

  it("distinguishes valid empty coverage from unavailable data", async () => {
    mocks.getZxy.mockResolvedValue(undefined);
    expect((await load()).status).toBe("not-covered");
    mocks.getZxy.mockRejectedValue(new Error("offline"));
    const result = await load();
    expect(result).toMatchObject({ status: "unavailable", datasetVersions: [], attribution: [] });
    expect(result.areas[0]!.bathymetry).toBeUndefined();
  });

  it("rejects a different archive encoding and malformed tiles", async () => {
    mocks.createArchive.mockReturnValue(mocks);
    mocks.getMetadata.mockResolvedValue({ topostack_encoding: "elevation" });
    expect((await load()).status).toBe("unavailable");
    expect(mocks.getZxy).not.toHaveBeenCalled();
    serveEveryArchive();
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
import craterFixture from "$lib/domain/fixtures/usgs-crater-z14.json";
import swissFixture from "$lib/domain/fixtures/swiss-zug-z14.json";
import { applySurveyProvenance, pixelBox } from "$lib/domain/bathymetry";
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

  it("loads real survey depths for an OSM fallback lake without HydroLAKES or GLOBathy metadata", async () => {
    surveyArchive(craterFixture.dataset, "usgs-crater-z14");
    const fallback = { ...surveyLake, outlineSource: "osm" as const, hylakId: undefined, maxDepthM: undefined };
    const result = await loadLakeBathymetry("", craterFixture.bounds, grid, 14, [fallback], undefined, dimensions);
    expect(result.status).toBe("available");
    expect(result.areas[0]?.bathymetry?.depthsM.some(Number.isFinite)).toBe(true);
    expect(result.datasetVersions).toContain(craterFixture.dataset);
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

describe("survey lake pixel bounds", () => {
  const inside = (x: number, y: number, ring: { x: number; y: number }[]) => {
    let result = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!, b = ring[j]!;
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  };

  it("visits every grid pixel the point-in-polygon test accepts", () => {
    let seed = 7;
    const random = () => { seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31; return seed / 2 ** 31; };
    const grid = { width: 97, height: 61 };
    const dimensions = { widthMm: 240, heightMm: 150 };
    for (let trial = 0; trial < 40; trial += 1) {
      const cx = (random() - 0.5) * 300, cy = (random() - 0.5) * 200, radius = 1 + random() * 60;
      const vertices = 3 + Math.floor(random() * 12);
      const ring = Array.from({ length: vertices }, (_, index) => {
        const angle = index / vertices * Math.PI * 2;
        const r = radius * (0.3 + random());
        return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
      });
      const box = pixelBox(ring, grid, dimensions);
      for (let row = 0; row < grid.height; row += 1) {
        for (let col = 0; col < grid.width; col += 1) {
          const x = (col / (grid.width - 1) - 0.5) * dimensions.widthMm;
          const y = (row / (grid.height - 1) - 0.5) * dimensions.heightMm;
          if (inside(x, y, ring)) {
            expect(row).toBeGreaterThanOrEqual(box.rowStart);
            expect(row).toBeLessThanOrEqual(box.rowEnd);
            expect(col).toBeGreaterThanOrEqual(box.colStart);
            expect(col).toBeLessThanOrEqual(box.colEnd);
          }
        }
      }
    }
    // A lake on a pixel boundary keeps that pixel.
    const edge = pixelBox([{ x: 0, y: 0 }, { x: 2.5, y: 0 }, { x: 2.5, y: 2.5 }, { x: 0, y: 2.5 }], grid, dimensions);
    expect(edge.colStart).toBeLessThanOrEqual(48);
    expect(edge.rowStart).toBeLessThanOrEqual(30);
    expect(pixelBox([], grid, dimensions).rowEnd).toBe(-1);
  });

  it("marks exactly the pixels the per-pixel point-in-polygon test marked", async () => {
    let seed = 31;
    const random = () => { seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31; return seed / 2 ** 31; };
    const grid = { width: 71, height: 53 };
    const dimensions = { widthMm: 180, heightMm: 120 };
    const ringAt = (cx: number, cy: number, radius: number, vertices: number) => Array.from({ length: vertices }, (_, index) => {
      const angle = index / vertices * Math.PI * 2;
      const r = radius * (0.3 + random());
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    });
    for (let trial = 0; trial < 30; trial += 1) {
      const cx = (random() - 0.5) * 200, cy = (random() - 0.5) * 140;
      const outer = ringAt(cx, cy, 8 + random() * 60, 3 + Math.floor(random() * 12));
      // Half the trials carry an island, so hole clearing is compared too.
      const holes = trial % 2 === 0 ? [ringAt(cx, cy, 2 + random() * 12, 3 + Math.floor(random() * 6))] : [];
      const mask = await buildPixelMask({ outer, holes }, grid, dimensions);
      const width = mask.colEnd - mask.colStart + 1;
      for (let row = 0; row < grid.height; row += 1) {
        for (let col = 0; col < grid.width; col += 1) {
          const x = (col / (grid.width - 1) - 0.5) * dimensions.widthMm;
          const y = (row / (grid.height - 1) - 0.5) * dimensions.heightMm;
          const expected = inside(x, y, outer) && !holes.some((hole) => inside(x, y, hole));
          const withinBox = row >= mask.rowStart && row <= mask.rowEnd && col >= mask.colStart && col <= mask.colEnd;
          const marked = withinBox && mask.inside[(row - mask.rowStart) * width + col - mask.colStart] === 1;
          expect(marked).toBe(expected);
        }
      }
    }
  });

  it("stops a long scanline pass when the load is cancelled", async () => {
    // Large enough to spend its yield budget, so the pass is parked on a
    // macrotask when the abort arrives — the old per-pixel loop never returned
    // to the event loop, so a Cancel could not be dispatched at all.
    const size = Math.ceil(Math.sqrt(MASK_YIELD_CELLS)) + 2;
    const controller = new AbortController();
    const outer = [{ x: -100, y: -100 }, { x: 100, y: -100 }, { x: 100, y: 100 }, { x: -100, y: 100 }];
    const pending = buildPixelMask({ outer, holes: [] }, { width: size, height: size }, { widthMm: 100, heightMm: 100 }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("abandons a survey load cancelled after its tiles arrived", async () => {
    surveyArchive(craterFixture.dataset, "usgs-crater-z14");
    const controller = new AbortController();
    const tile = { data: Uint8Array.from(readFileSync(new URL("./fixtures/usgs-crater-z14.png", import.meta.url))).buffer };
    // Cancel once the archive has answered, while the per-lake pixel pass is
    // the only work left: the load must abandon it instead of publishing depths.
    mocks.getZxy.mockImplementation(() => { queueMicrotask(() => controller.abort()); return Promise.resolve(tile); });
    const wide = { width: 64, height: 64, values: new Float32Array(64 * 64), min: 0, max: 0 };
    const pending = loadLakeBathymetry("", craterFixture.bounds, wide, 14, [surveyLake], controller.signal, dimensions);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
