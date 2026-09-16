import { describe, expect, it } from "vitest";
import { carveWaterDepth, DEFAULT_PROJECT, generateGeometry, createSyntheticSource, type WaterAreaV1 } from "./index.js";

const config = { ...DEFAULT_PROJECT, widthMm: 100, heightMm: 100, waterDepthExaggeration: 1 };
const grid = { width: 5, height: 5, values: new Float32Array(25).fill(180), min: 180, max: 180 };
const ring = (lo: number, hi: number) => [{ x: lo, y: lo }, { x: hi, y: lo }, { x: hi, y: hi }, { x: lo, y: hi }, { x: lo, y: lo }];
const lake = (depths = new Float32Array(25).fill(20)): WaterAreaV1 => ({
  id: "erie", kind: "lake", name: "Lake Erie", hylakId: 1,
  polygon: { outer: ring(-40, 40), holes: [] }, maxDepthM: 100,
  bathymetry: { width: 5, height: 5, depthsM: depths },
});

describe("NOAA lake-floor carving", () => {
  it("preserves an asymmetric measured basin and applies exaggeration once", () => {
    const area = lake();
    area.bathymetry!.depthsM[11] = 5;
    area.bathymetry!.depthsM[13] = 60;
    for (const multiplier of [1, 2]) {
      const result = carveWaterDepth(grid, { ...config, waterDepthExaggeration: multiplier }, [area], 5000);
      expect(result.grid.values[11]).toBe(180 - 5 * multiplier);
      expect(result.grid.values[13]).toBe(180 - 60 * multiplier);
      expect(result.grid.values[0]).toBe(180);
      expect(result.surfaces[0]).toMatchObject({ depthSource: "surveyed", surfaceElevationM: 180 });
      expect(result.warnings).toEqual([]);
    }
    expect(grid.values[13]).toBe(180);
  });

  it("carves clipped lake interiors without needing a visible shoreline", () => {
    const area = lake();
    area.polygon.outer = ring(-100, 100);
    area.clipped = true;
    const result = carveWaterDepth(grid, config, [area], 5000);
    expect(result.grid.min).toBe(160);
    expect(result.grid.max).toBe(160);
    expect(result.warnings).toEqual([]);
  });

  it("keeps islands and elevated banks intact", () => {
    const area = lake();
    area.polygon.holes = [ring(-10, 10)];
    const terrain = { ...grid, values: Float32Array.from(grid.values), max: 220 };
    terrain.values[6] = 220;
    const result = carveWaterDepth(terrain, config, [area], 5000);
    expect(result.grid.values[12]).toBe(180);
    expect(result.grid.values[6]).toBe(220);
    expect(result.grid.values[13]).toBe(160);
  });

  it("uses modeled depths only at missing samples and reports mixed coverage", () => {
    const area = lake();
    area.bathymetry!.depthsM[12] = Number.NaN;
    const result = carveWaterDepth(grid, config, [area], 5000);
    expect(result.grid.values[13]).toBe(160);
    expect(result.grid.values[12]).toBeLessThan(180);
    expect(result.surfaces[0]?.depthSource).toBe("mixed");
    expect(result.warnings[0]?.code).toBe("BATHYMETRY_FALLBACK");
  });

  it("falls back to the existing basin model when there are no survey samples", () => {
    const area = lake(new Float32Array(25).fill(Number.NaN));
    const result = carveWaterDepth(grid, config, [area], 5000);
    expect(result.surfaces[0]?.depthSource).toBe("modeled");
    expect(result.grid.min).toBeLessThan(180);
  });

  it("rejects mismatched dimensions and invalid depths", () => {
    const area = lake();
    area.bathymetry!.width = 6;
    expect(() => carveWaterDepth(grid, config, [area], 5000)).toThrow(/dimensions/);
    area.bathymetry!.width = 5;
    area.bathymetry!.depthsM[12] = -100;
    expect(() => carveWaterDepth(grid, config, [area], 5000)).toThrow(/invalid depth/);
  });

  it("does not carve disabled depth and carries archive failure into export warnings", () => {
    const source = { ...createSyntheticSource(config, 5), elevation: grid, waterAreas: [lake()], bathymetryStatus: "unavailable" as const };
    const result = generateGeometry(config, source);
    expect(result.warnings.some((warning) => warning.code === "BATHYMETRY_FALLBACK")).toBe(true);
    const disabled = generateGeometry({ ...config, showWaterDepth: false }, source);
    expect(disabled.waterSurfaces).toEqual([]);
    expect(disabled.warnings.some((warning) => warning.code === "BATHYMETRY_FALLBACK")).toBe(false);
  });

  it("uses the lake waterline when the base DEM already contains a basin", () => {
    const area = lake();
    area.surfaceElevationM = 180;
    const terrain = { ...grid, values: Float32Array.from(grid.values), min: 100 };
    terrain.values[11] = 100;
    terrain.values[12] = 120;
    terrain.values[13] = 140;
    const result = carveWaterDepth(terrain, config, [area], 5000);
    expect(result.surfaces[0]?.surfaceElevationM).toBe(180);
    expect(result.grid.values[11]).toBe(160);
  });
});
