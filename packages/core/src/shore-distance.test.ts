import { describe, expect, it } from "vitest";
import { contours } from "d3-contour";
import { vectorShoreDistances } from "./shore-distance.js";
import { close, distanceToSegment, pointInPolygon } from "./geometry2d.js";
import { carveWaterDepth } from "./water.js";
import { DEFAULT_PROJECT, type Polygon2D } from "./types.js";

const polygon: Polygon2D = { outer: close(Array.from({ length: 96 }, (_, i) => ({ x: 30 * Math.cos(i * Math.PI / 48), y: 30 * Math.sin(i * Math.PI / 48) }))), holes: [] };

describe("sub-cell lake terrain", () => {
  it("matches exact vector distances with islands and unequal ground spacing", () => {
    const shape = { ...polygon, holes: [close([{ x: -2, y: -2 }, { x: -2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: -2 }])] };
    const width = 31, height = 21;
    const cells = Array.from({ length: width * height }, (_, i) => i).filter(i => pointInPolygon({ x: (i % width / (width - 1) - 0.5) * 100, y: (Math.floor(i / width) / (height - 1) - 0.5) * 100 }, shape));
    const into = new Float64Array(width * height).fill(-1);
    vectorShoreDistances(shape, cells, width, height, 100, 100, 2000, 1000, into);
    const rings = [shape.outer, ...shape.holes].map(r => r.map(p => ({ x: p.x * 20, y: p.y * 10 })));
    for (const i of cells) {
      const point = { x: (i % width / (width - 1) - 0.5) * 2000, y: (Math.floor(i / width) / (height - 1) - 0.5) * 1000 };
      const expected = Math.min(...rings.flatMap(r => r.slice(1).map((p, index) => distanceToSegment(point, r[index]!, p))));
      expect(into[i]).toBeCloseTo(expected, 8);
    }
    expect(into[0]).toBe(-1);
  });

  it("removes raster terraces in the actual shallow cut contour of a sparse basin", () => {
    const size = 41, surface = 100;
    const grid = { width: size, height: size, values: new Float32Array(size * size).fill(surface), min: surface, max: surface };
    const lake = { id: "sparse", kind: "lake" as const, polygon, maxDepthM: 100 };
    const project = { ...DEFAULT_PROJECT, widthMm: 100, heightMm: 100, waterDepthExaggeration: 1 };
    const original = carveWaterDepth(grid, { ...project, smoothing: 0 }, [lake], 2000, 2000);
    const smoothed = carveWaterDepth(grid, { ...project, smoothing: 1 }, [lake], 2000, 2000);
    const error = (values: Float32Array) => {
      const contour = contours().size([size, size]).thresholds([90])(Array.from(values))[0]!;
      const holes = contour.coordinates.flatMap(p => p.slice(1));
      expect(holes).toHaveLength(1);
      return holes[0]!.reduce((sum, [x, y]) => sum + Math.abs(Math.hypot(((x! - 0.5) / (size - 1) - 0.5) * 2000, ((y! - 0.5) / (size - 1) - 0.5) * 2000) - 540), 0) / holes[0]!.length;
    };
    expect(error(smoothed.grid.values)).toBeLessThan(error(original.grid.values) * 0.4);
    expect(smoothed.grid.min).toBeCloseTo(0, 5);
    expect(grid.values.every(value => value === surface)).toBe(true);
    smoothed.grid.values.forEach((value, i) => { if (!smoothed.waterMask[i]) expect(value).toBe(surface); });
  });
});
