import { describe, expect, it } from "vitest";
import { pointInPolygon } from "../primitives/geometry2d.js";
import { DEFAULT_PROJECT, type ElevationGrid, type Point2D, type Polygon2D, type ProjectConfigV1, type WaterAreaV1 } from "../types.js";
import { carveWaterDepth, fitLakesToLadder } from "./water.js";

/** Deterministic pseudo-random sequence so failures reproduce. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function blob(next: () => number, center: Point2D, radius: number, vertices: number): Point2D[] {
  const ring = Array.from({ length: vertices }, (_, index) => {
    const angle = index / vertices * Math.PI * 2;
    const r = radius * (0.55 + 0.45 * next());
    return { x: center.x + Math.cos(angle) * r, y: center.y + Math.sin(angle) * r };
  });
  return [...ring, { ...ring[0]! }];
}

/** The pre-rasterization reference: every cell tested against the polygon with the shared ray cast. */
function referenceCell(column: number, row: number, grid: ElevationGrid, config: ProjectConfigV1): Point2D {
  const inset = 1e-3;
  const insetX = column === 0 ? inset : column === grid.width - 1 ? -inset : 0;
  const insetY = row === 0 ? inset : row === grid.height - 1 ? -inset : 0;
  return {
    x: (column / (grid.width - 1) - 0.5 + insetX / (grid.width - 1)) * config.widthMm,
    y: (row / (grid.height - 1) - 0.5 + insetY / (grid.height - 1)) * config.heightMm,
  };
}

function referenceMask(polygons: Polygon2D[], grid: ElevationGrid, config: ProjectConfigV1): Uint8Array {
  const mask = new Uint8Array(grid.width * grid.height);
  for (let row = 0; row < grid.height; row += 1) {
    for (let column = 0; column < grid.width; column += 1) {
      const point = referenceCell(column, row, grid, config);
      if (polygons.some((polygon) => pointInPolygon(point, polygon))) mask[row * grid.width + column] = 1;
    }
  }
  return mask;
}

function scenario(seed: number, width: number, height: number) {
  const next = random(seed);
  const config: ProjectConfigV1 = { ...DEFAULT_PROJECT, widthMm: 240, heightMm: 160 };
  const values = new Float32Array(width * height).fill(500);
  const grid: ElevationGrid = { width, height, values, min: 500, max: 500 };
  const areas: WaterAreaV1[] = [];
  for (let index = 0; index < 6; index += 1) {
    const center = { x: (next() - 0.5) * config.widthMm * 1.1, y: (next() - 0.5) * config.heightMm * 1.1 };
    const radius = 10 + next() * 60;
    const holes = next() < 0.5 ? [blob(next, center, radius * 0.25, 12)] : [];
    areas.push({ id: `lake-${index}`, kind: "lake", polygon: { outer: blob(next, center, radius, 40 + Math.floor(next() * 200)), holes }, maxDepthM: 50 + next() * 400, clipped: true });
  }
  // Outlines running exactly along the crop border and through sample rows,
  // which is where the edge inset and the half-open scanline rule matter.
  const halfWidth = config.widthMm / 2;
  const halfHeight = config.heightMm / 2;
  const rowY = (2 / (height - 1) - 0.5) * config.heightMm;
  areas.push({ id: "ocean", kind: "ocean", polygon: { outer: [{ x: -halfWidth, y: -halfHeight }, { x: -halfWidth * 0.6, y: -halfHeight }, { x: -halfWidth * 0.6, y: rowY }, { x: -halfWidth * 0.3, y: halfHeight }, { x: -halfWidth, y: halfHeight }, { x: -halfWidth, y: -halfHeight }], holes: [] } });
  return { config, grid, areas };
}

describe("lake rasterization", () => {
  it.each([[1, 41, 29], [7, 64, 64], [42, 97, 53], [2024, 12, 150]])("matches per-cell ray casting exactly (seed %i, %ix%i)", (seed, width, height) => {
    const { config, grid, areas } = scenario(seed, width, height);
    const carved = carveWaterDepth(grid, config, areas, 12_000);
    expect(Array.from(carved.waterMask)).toEqual(Array.from(referenceMask(areas.map((area) => area.polygon), grid, config)));
    expect(carved.surfaceCells).toHaveLength(carved.surfaces.length);
    carved.surfaces.forEach((surface, index) => {
      const reference = referenceMask(surface.polygons, grid, config);
      expect(Array.from(carved.surfaceCells![index]!)).toEqual(Array.from(reference.keys()).filter((cell) => reference[cell]));
    });
  });

  it("fits lakes identically with cached or recomputed cells", () => {
    const { config, grid, areas } = scenario(99, 80, 60);
    const values = Float32Array.from(grid.values, (_, index) => 500 - (index % 17) * 3);
    const carved = carveWaterDepth({ ...grid, values, min: 452, max: 500 }, config, areas, 12_000);
    const floor = carved.grid.min + 5;
    const cached = fitLakesToLadder(carved, config, floor);
    const recomputed = fitLakesToLadder({ ...carved, surfaceCells: undefined }, config, floor);
    expect(Array.from(cached.grid.values)).toEqual(Array.from(recomputed.grid.values));
    expect(cached.surfaces).toEqual(recomputed.surfaces);
  });

  it("rasterizes detailed lakes on a large grid quickly", () => {
    const next = random(5);
    const config: ProjectConfigV1 = { ...DEFAULT_PROJECT, widthMm: 300, heightMm: 300 };
    const size = 512;
    const grid: ElevationGrid = { width: size, height: size, values: new Float32Array(size * size).fill(800), min: 800, max: 800 };
    const areas: WaterAreaV1[] = Array.from({ length: 8 }, (_, index) => ({
      id: `lake-${index}`,
      kind: "lake",
      polygon: { outer: blob(next, { x: (next() - 0.5) * 200, y: (next() - 0.5) * 200 }, 40, 2000), holes: [] },
      maxDepthM: 100,
    }));
    const started = performance.now();
    const carved = carveWaterDepth(grid, config, areas, 20_000);
    fitLakesToLadder(carved, config, 780);
    // Per-cell ray casting took ~37 s here; the budget leaves ample CI headroom.
    expect(performance.now() - started).toBeLessThan(8_000);
    expect(carved.surfaces).toHaveLength(8);
  });
});
