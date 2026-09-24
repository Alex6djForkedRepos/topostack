import { describe, expect, it } from "vitest";
import { encodeChartDepths, type ChartGridV1 } from "@topostack/data-contracts/chart-bathymetry";
import { chartStackLayers, representativeChartGeometry } from "./chart-stack";

function grid(values: number[], width = 5): ChartGridV1 {
  return { width, height: values.length / width, bounds: { west: 0, east: 0.01, south: 0, north: 0.01 }, method: "harmonic", depthsDm: encodeChartDepths(values) };
}
describe("chart stack sheets", () => {
  it("cuts deep water out of upper sheets and closes the basin with a lower sheet", () => {
    const values = new Array<number>(25).fill(0);
    values[12] = 20;
    const stack = chartStackLayers(grid(values), 10);
    expect(stack.layers).toHaveLength(2);
    expect(stack.layers[0]!.polygons[0]).toHaveLength(2);
    expect(stack.layers[1]!.polygons[0]).toHaveLength(1);
    expect(stack.layers[0]!.top).toBe(-0);
    expect(stack.layers[1]!.top).toBeCloseTo(-stack.layers[0]!.thickness);
    expect(stack.totalDepth).toBeCloseTo(2 * stack.layers[0]!.thickness);
  });
  it("keeps missing coverage as holes through every sheet", () => {
    const values = new Array<number>(25).fill(5);
    values[12] = NaN;
    const stack = chartStackLayers(grid(values), 2);
    expect(stack.layers.at(-1)!.polygons[0]).toHaveLength(2);
    expect(stack.layers.flatMap(layer => layer.polygons.flat(3)).every(Number.isFinite)).toBe(true);
  });
  it("keeps disconnected lake parts separate", () => {
    const values = new Array<number>(25).fill(0);
    for (let row = 0; row < 5; row++) values[row * 5 + 2] = NaN;
    expect(chartStackLayers(grid(values), 5).layers[0]!.polygons).toHaveLength(2);
  });
  it("bounds layer count by grouping chart intervals and reports the simplified interval", () => {
    const stack = chartStackLayers(grid(new Array<number>(25).fill(100)), 0.1);
    expect(stack.layers.length).toBeLessThanOrEqual(64);
    expect(stack.stepM).toBeCloseTo(1.6);
    expect(stack.simplified).toBe(true);
  });
  it("represents zero depth as one flat sheet", () => {
    const stack = chartStackLayers(grid(new Array<number>(25).fill(0)), 5);
    expect(stack.layers).toHaveLength(1);
    expect(stack.layers[0]!.polygons[0]).toHaveLength(1);
    expect(stack.layers[0]!.thickness).toBeGreaterThan(0);
  });
});

describe("representative main-stack geometry", () => {
  it("uses twelve thin sheets, a rectangular backing, and a carved basin", () => {
    const values = new Array<number>(25).fill(0);
    values[12] = 20;
    const geometry = representativeChartGeometry(grid(values));
    expect(geometry.layers).toHaveLength(12);
    expect(geometry.layers.every(layer => layer.materialThicknessMm === 3)).toBe(true);
    expect(geometry.layers[0]!.polygons).toHaveLength(1);
    expect(geometry.layers[0]!.polygons[0]!.holes).toHaveLength(0);
    expect(geometry.layers.at(-1)!.polygons[0]!.holes.length).toBeGreaterThan(0);
    expect(Math.max(geometry.widthMm, geometry.heightMm)).toBeCloseTo(300);
    expect(geometry.layers.map(layer => layer.index)).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });
  it("keeps a flat chart flat and retains the representative sheet count", () => {
    const geometry = representativeChartGeometry(grid(new Array<number>(25).fill(0)));
    expect(geometry.layers).toHaveLength(12);
    expect(geometry.layers.every(layer => layer.polygons.length === 1 && layer.polygons[0]!.holes.length === 0)).toBe(true);
  });
});
