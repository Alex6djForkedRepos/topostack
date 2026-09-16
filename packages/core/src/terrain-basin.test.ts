import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, type ElevationGrid, type WaterAreaV1 } from "./types.js";
import { carveWaterDepth, distanceToShoreM } from "./water.js";
import { vectorShoreDistances } from "./shore-distance.js";
import { terrainBasinDistance } from "./terrain-basin.js";

const config = { ...DEFAULT_PROJECT, widthMm: 100, heightMm: 100, waterDepthExaggeration: 1 };
const surface = 1000;
const groundSize = 2000;
const radius = 600;
const lake: WaterAreaV1 = {
  id: "test", kind: "lake", maxDepthM: 100,
  polygon: { outer: Array.from({ length: 128 }, (_, i) => ({ x: 30.01 * Math.cos(i * Math.PI / 64), y: 30.01 * Math.sin(i * Math.PI / 64) })), holes: [] },
};
function terrain(width = 81, height = width, direction: "x" | "y" = "x", flat = false): ElevationGrid {
  const values = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const xx = (x / (width - 1) - 0.5) * groundSize, yy = (y / (height - 1) - 0.5) * groundSize;
    const slope = flat ? 0 : 0.04 + 0.76 * Math.max(0, Math.min(1, ((direction === "x" ? xx : yy) / radius + 1) / 2));
    values[y * width + x] = surface + Math.max(0, Math.hypot(xx, yy) - radius) * slope;
  }
  return { width, height, values, min: surface, max: Math.max(...values) };
}
const carve = (grid: ElevationGrid, area = lake, exaggeration = 1) => carveWaterDepth(grid, { ...config, waterDepthExaggeration: exaggeration }, [area], groundSize, groundSize);
const depthAt = (grid: ElevationGrid, x: number, y = 0) => surface - grid.values[Math.round((y / groundSize + 0.5) * (grid.height - 1)) * grid.width + Math.round((x / groundSize + 0.5) * (grid.width - 1))]!;

describe("terrain-informed lake basins", () => {
  it("makes steep shores deeper than gentle shores at equal distance and moves the deepest point", () => {
    const input = terrain();
    const original = input.values.slice();
    const result = carve(input);
    expect(depthAt(result.grid, 350)).toBeGreaterThan(depthAt(result.grid, -350) * 1.25);
    const deepest = result.grid.values.indexOf(result.grid.min);
    expect(deepest % input.width).toBeGreaterThan((input.width - 1) / 2);
    expect(result.grid.min).toBeCloseTo(surface - 100, 4);
    expect(result.surfaces[0]?.depthSource).toBe("modeled");
    expect(input.values).toEqual(original);
    result.grid.values.forEach((value, i) => {
      expect(Number.isFinite(value)).toBe(true);
      if (!result.waterMask[i]) expect(value).toBe(original[i]);
      else expect(value).toBeGreaterThanOrEqual(surface - 100);
    });
  });

  it("honors mean depth, maximum overrides, and uniform exaggeration", () => {
    const input = terrain();
    const area = { ...lake, maxDepthM: 150, meanDepthM: 55, depthSource: "user" as const };
    const normal = carve(input, area);
    const exaggerated = carve(input, area, 2);
    let total = 0, count = 0;
    normal.grid.values.forEach((value, i) => {
      if (!normal.waterMask[i]) return;
      total += surface - value; count += 1;
      expect(surface - exaggerated.grid.values[i]!).toBeCloseTo(2 * (surface - value), 3);
    });
    expect(total / count).toBeCloseTo(55, 0);
    expect(normal.grid.min).toBeCloseTo(surface - 150, 3);
    expect(normal.surfaces[0]?.depthSource).toBe("user");
  });

  it("retains the raster distance fallback with smoothing disabled when terrain is flat or missing", () => {
    for (const missing of [false, true]) {
      const input = terrain(41, 41, "x", true);
      if (missing) input.values.forEach((_, i) => {
        const x = (i % 41 - 20) * 50, y = (Math.floor(i / 41) - 20) * 50;
        if (Math.hypot(x, y) > radius) input.values[i] = Number.NaN;
      });
      const result = carveWaterDepth(input, { ...config, smoothing: 0 }, [lake], groundSize, groundSize);
      const distance = distanceToShoreM(result.waterMask, 41, 41, 50, 50);
      const cells = Array.from(result.waterMask.keys()).filter((i) => result.waterMask[i]);
      const shape = terrainBasinDistance(input, result.waterMask, result.waterMask, cells, distance, 50, 50, surface, 100 / radius, false);
      expect(shape).toBe(distance);
      const maximum = Math.max(...cells.map((i) => distance[i]!));
      cells.forEach((i) => expect(surface - result.grid.values[i]!).toBeCloseTo(100 * distance[i]! / maximum, 3));
    }
  });

  it("seeds terrain-informed shallow banks at the vector shore between grid samples", () => {
    const input = terrain(41);
    const result = carve(input);
    const cells = Array.from(result.waterMask.keys()).filter(i => result.waterMask[i]);
    const distance = vectorShoreDistances(lake.polygon, cells, 41, 41, 100, 100, groundSize, groundSize, new Float64Array(41 * 41));
    const shape = terrainBasinDistance(input, result.waterMask, result.waterMask, cells, distance, 50, 50, surface, 100 / radius, false, undefined, true);
    expect(shape).not.toBe(distance);
    const shallow = cells.filter(i => distance[i]! < 1);
    expect(shallow.length).toBeGreaterThan(0);
    // Bank factors are bounded at 2. Raster-center seeds would instead put
    // these almost-on-shore samples tens of meters down the distance field.
    shallow.forEach(i => expect(shape[i]!).toBeLessThanOrEqual(2 * distance[i]!));
    cells.forEach(i => expect(Number.isFinite(shape[i])).toBe(true));
  });

  it("keeps clipped lakes on the whole-lake distance scale without fitting the visible mean", () => {
    const input = terrain();
    const area = { ...lake, clipped: true, lmaxM: 1200, meanDepthM: 80 };
    const result = carve(input, area);
    const distance = distanceToShoreM(result.waterMask, 81, 81, 25, 25);
    result.grid.values.forEach((value, i) => {
      if (result.waterMask[i]) expect(surface - value).toBeCloseTo(100 * distance[i]! / 1200, 3);
    });
  });

  it("does not invent a shore at a map edge even when the clipped flag is absent", () => {
    const input = terrain();
    const area = { ...lake, polygon: { outer: [{ x: -60, y: -60 }, { x: 60, y: -60 }, { x: 60, y: 60 }, { x: -60, y: 60 }], holes: [] } };
    const flat = { ...input, values: new Float32Array(input.values.length).fill(surface) };
    const result = carve(flat, area);
    expect(result.grid.values).toEqual(flat.values);
    expect(result.warnings[0]?.code).toBe("WATER_DEPTH_CLAMPED");
  });

  it("falls back when only part of the lake touches the grid edge without a clipped flag", () => {
    const input = terrain();
    const area = { ...lake, lmaxM: 1200, polygon: { outer: [
      { x: -20, y: -30 }, { x: 60, y: -30 }, { x: 60, y: 30 }, { x: -20, y: 30 },
    ], holes: [] } };
    // Keep the DEM flat inside this differently shaped lake.
    for (let y = 16; y <= 64; y += 1) for (let x = 24; x < 81; x += 1) input.values[y * 81 + x] = surface;
    const result = carve(input, area);
    const distance = distanceToShoreM(result.waterMask, 81, 81, 25, 25);
    expect(result.waterMask[40 * 81 + 80]).toBe(1);
    expect(result.surfaces[0]?.depthSource).toBe("modeled");
    result.grid.values.forEach((value, i) => {
      if (result.waterMask[i]) expect(surface - value).toBeCloseTo(100 * distance[i]! / 1200, 3);
    });
  });

  it("uses physical spacing and preserves the profile when the grid axes are transposed", () => {
    const horizontal = carve(terrain(81, 41, "x"));
    const vertical = carve(terrain(41, 81, "y"));
    for (const x of [-400, -200, 0, 200, 400]) {
      expect(depthAt(horizontal.grid, x)).toBeCloseTo(depthAt(vertical.grid, 0, x), 0);
    }
    expect(depthAt(horizontal.grid, 400)).toBeGreaterThan(depthAt(horizontal.grid, -400));
  });

  it("produces similar profiles at different terrain resolutions", () => {
    const coarse = carve(terrain(51));
    const fine = carve(terrain(101));
    for (const x of [-400, -200, 0, 200, 400]) {
      expect(Math.abs(depthAt(coarse.grid, x) - depthAt(fine.grid, x))).toBeLessThan(10);
    }
  });

  it("preserves survey samples exactly and uses the terrain prior only in gaps", () => {
    const input = terrain();
    const modeled = carve(input);
    const depthsM = new Float32Array(input.values.length).fill(Number.NaN);
    const measuredCell = 40 * 81 + 40;
    depthsM[measuredCell] = 17;
    const result = carve(input, { ...lake, bathymetry: { width: 81, height: 81, depthsM } });
    result.grid.values.forEach((value, i) => expect(value).toBe(i === measuredCell ? surface - 17 : modeled.grid.values[i]));
    expect(result.surfaces[0]?.depthSource).toBe("mixed");
  });

  it("preserves islands and elevated banks", () => {
    const input = terrain();
    const hole = [{ x: -4, y: -4 }, { x: 4, y: -4 }, { x: 4, y: 4 }, { x: -4, y: 4 }];
    const center = 40 * 81 + 40, bank = 40 * 81 + 63;
    input.values[center] = surface + 80;
    input.values[bank] = surface + 30;
    const result = carve(input, { ...lake, polygon: { ...lake.polygon, holes: [hole] } });
    expect(result.waterMask[center]).toBe(0);
    expect(result.grid.values[center]).toBe(surface + 80);
    expect(result.grid.values[bank]).toBe(surface + 30);
  });

  it("is insensitive to one extreme land sample", () => {
    const input = terrain();
    const normal = carve(input);
    input.values[40 * 81 + 68] = surface + 10000;
    const spike = carve(input);
    for (const x of [-400, -200, 0, 200, 400]) {
      expect(Math.abs(depthAt(normal.grid, x) - depthAt(spike.grid, x))).toBeLessThan(2);
    }
  });

  it("does not use neighboring lake elevations as terrain and is independent of area order", () => {
    const input = terrain();
    const neighbor: WaterAreaV1 = { id: "neighbor", kind: "lake", maxDepthM: 50,
      polygon: { outer: [{ x: 34, y: -20 }, { x: 48, y: -20 }, { x: 48, y: 20 }, { x: 34, y: 20 }], holes: [] } };
    for (let y = 25; y <= 55; y += 1) for (let x = 68; x <= 78; x += 1) input.values[y * 81 + x] = surface + 200;
    const first = carveWaterDepth(input, config, [lake, neighbor], groundSize, groundSize);
    const second = carveWaterDepth(input, config, [neighbor, lake], groundSize, groundSize);
    expect(first.grid.values).toEqual(second.grid.values);
    const changed = { ...input, values: input.values.slice() };
    // Change only terrain samples strictly inside the neighboring water body.
    for (let y = 25; y <= 55; y += 1) for (let x = 68; x <= 78; x += 1) {
      if ((x / 80 - 0.5) * 100 < 48) changed.values[y * 81 + x] = surface + 800;
    }
    const high = carveWaterDepth(changed, config, [lake, neighbor], groundSize, groundSize);
    for (const x of [-400, -200, 0, 200, 400]) expect(depthAt(high.grid, x)).toBe(depthAt(first.grid, x));
  });
});
