import { describe, expect, it } from "vitest";
import fixture from "./fixtures/bergen-lake.json";
import { smoothLakePolygon, smoothLakeShorelines } from "./lake-shoreline.js";
import { close, signedArea } from "./geometry2d.js";
import { createSyntheticSource } from "./geometry.js";
import { DEFAULT_PROJECT, type Point2D, type Polygon2D } from "./types.js";

const polygon: Polygon2D = {
  outer: fixture.coordinates[0]!.map(([lon, lat]) => ({ x: (lon! - 5.3344) * 55500 / 10, y: (60.2657 - lat!) * 111000 / 10 })), holes: [],
};
const largestTurn = (ring: Point2D[]) => Math.max(...ring.slice(0, -1).map((p, i, all) => {
  const a = all[(i + all.length - 1) % all.length]!, b = all[(i + 1) % all.length]!;
  return Math.acos(Math.max(-1, Math.min(1, ((p.x - a.x) * (b.x - p.x) + (p.y - a.y) * (b.y - p.y)) /
    (Math.hypot(p.x - a.x, p.y - a.y) * Math.hypot(b.x - p.x, b.y - p.y)))));
}));

describe("lake shoreline smoothing", () => {
  it("reduces angular corners at 60.2657, 5.3344 while retaining lake area", () => {
    const result = smoothLakePolygon(polygon, 1);
    expect(largestTurn(result.outer)).toBeLessThan(largestTurn(polygon.outer) * 0.5);
    expect(Math.abs(signedArea(result.outer) / signedArea(close(polygon.outer)) - 1)).toBeLessThan(0.05);
    expect(result.outer[0]).toEqual(result.outer.at(-1));
  });

  it("keeps scoring, fill and basin outlines identical without modifying cached data", () => {
    const source = { ...createSyntheticSource(DEFAULT_PROJECT), waterAreas: [{ id: "lake", kind: "lake" as const, polygon }],
      waterPatternAreas: [structuredClone(polygon)], markings: [{ id: "shore", kind: "water" as const, operation: "score" as const, points: structuredClone(polygon.outer) }] };
    const original = structuredClone(source);
    const result = smoothLakeShorelines(source, DEFAULT_PROJECT);
    expect(result.markings[0]!.points).toEqual(result.waterAreas![0]!.polygon.outer);
    expect(result.waterPatternAreas![0]).toEqual(result.waterAreas![0]!.polygon);
    expect(smoothLakeShorelines(source, DEFAULT_PROJECT)).toEqual(result);
    expect(source).toEqual(original);
    expect(smoothLakeShorelines(source, { ...DEFAULT_PROJECT, smoothing: 0 })).toBe(source);
  });

  it("rejects smoothing that would cut through an island near the bank", () => {
    const original = { outer: close([{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }]),
      holes: [close([{ x: 9.7, y: 9.7 }, { x: 9.7, y: 9.9 }, { x: 9.9, y: 9.9 }, { x: 9.9, y: 9.7 }])] };
    expect(smoothLakePolygon(original, 1)).toBe(original);
  });

  it("preserves islands, handles duplicate samples, and leaves ocean and rivers alone", () => {
    const square = (size: number) => close([{ x: -size, y: -size }, { x: size, y: -size }, { x: size, y: size }, { x: -size, y: size }]);
    const island = { outer: square(20), holes: [square(3).reverse()] };
    const result = smoothLakePolygon(island, 1);
    expect(result.holes).toHaveLength(1);
    expect(signedArea(result.holes[0]!)).toBeLessThan(0);
    expect(smoothLakePolygon({ ...polygon, outer: [polygon.outer[0]!, ...polygon.outer] }, 1)).toEqual(smoothLakePolygon(polygon, 1));
    const source = { ...createSyntheticSource(DEFAULT_PROJECT), waterAreas: [{ id: "sea", kind: "ocean" as const, polygon }],
      markings: [{ id: "river", kind: "water" as const, operation: "score" as const, points: [{ x: 0, y: 0 }, { x: 1, y: 2 }] }] };
    expect(smoothLakeShorelines(source, DEFAULT_PROJECT)).toBe(source);
  });
});
