import { describe, expect, it } from "vitest";
import { encodeChartDepths, type ChartGridV1 } from "@topostack/data-contracts/chart-bathymetry";
import { chartSurface, automaticDepthExaggeration } from "./chart-surface";

function grid(depths: number[]): ChartGridV1 {
  return { width: 2, height: 2, bounds: { west: 0, east: 0.01, south: -0.005, north: 0.005 }, method: "harmonic", depthsDm: encodeChartDepths(depths) };
}

describe("chart verification surface", () => {
  it("uses cell centres, north-up orientation and metre depths below the surface", () => {
    const surface = chartSurface(grid([0, 10, 20, 30]));
    expect(Array.from(surface.positions.slice(0, 3))).toEqual([-0.5, -0, -0.5]);
    expect(surface.positions[3]).toBe(0.5);
    expect(surface.positions[8]).toBe(0.5);
    expect(surface.positions[4]).toBeCloseTo(-10 * surface.scale);
    expect(surface.deepest).toBe(30);
    expect(Array.from(surface.indices)).toEqual([0, 2, 1, 1, 2, 3]);
  });
  it("does not triangulate across missing samples or islands", () => {
    const surface = chartSurface(grid([0, 10, NaN, 30]));
    expect(surface.indices).toHaveLength(0);
    expect(Array.from(surface.positions).every(Number.isFinite)).toBe(true);
    const corner = chartSurface(grid([NaN, 10, 20, 30]));
    expect(Array.from(corner.indices)).toEqual([1, 2, 3]);
  });
  it("keeps flat, zero-depth grids finite", () => {
    const surface = chartSurface(grid([0, 0, 0, 0]));
    expect(Array.from(surface.colors).every(Number.isFinite)).toBe(true);
    expect(surface.indices).toHaveLength(6);
  });
  it("accounts for longitude distances at the lake latitude", () => {
    const input = grid([0, 10, 20, 30]);
    input.bounds.south = 59.995; input.bounds.north = 60.005;
    const surface = chartSurface(input);
    expect(surface.positions[3]! - surface.positions[0]!).toBeCloseTo(0.5);
    expect(surface.positions[8]! - surface.positions[2]!).toBeCloseTo(1);
  });
});

describe("automatic depth exaggeration", () => {
  it("makes a wide shallow lake visibly three dimensional", () => {
    const scale = 2 / 100000;
    const exaggeration = automaticDepthExaggeration(10, scale);
    expect(10 * scale * exaggeration).toBeCloseTo(0.6);
  });
  it("does not flatten deep lakes or divide by zero for a flat grid", () => {
    expect(automaticDepthExaggeration(1000, 0.002)).toBe(1);
    expect(automaticDepthExaggeration(0, 0.002)).toBe(1);
  });
});
