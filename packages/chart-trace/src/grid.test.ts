import { describe, expect, it } from "vitest";
import fixture from "./fixtures/tin-parity.json";
import { gridDepths, harmonicGridMetres, inferIntervalM, tinGridMetres, waterLayout, type GridContour } from "./grid.ts";
import { localFrame, type Point2 } from "./local-frame.ts";
import { fillRings } from "./raster-fill.ts";

const circle = (cx: number, cy: number, radius: number, count = 96): Point2[] =>
  Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
  });

describe("tinGridMetres", () => {
  it("reproduces survey_regions.contour_grid to the centimetre", () => {
    const points = fixture.points as [number, number, number][];
    const water = fixture.water as Point2[][];
    const { layout, values } = tinGridMetres(points, water, fixture.resolution);
    expect(layout).toMatchObject({ ...fixture.layout, resolution: fixture.resolution });
    let compared = 0;
    let worst = 0;
    fixture.values.forEach((expected, cell) => {
      const actual = values[cell]!;
      if (expected === null) {
        expect(Number.isNaN(actual), `cell ${cell} should be blank`).toBe(true);
        return;
      }
      compared += 1;
      worst = Math.max(worst, Math.abs(actual - expected));
    });
    expect(compared).toBeGreaterThan(4000);
    expect(worst).toBeLessThan(0.01);
  });

  it.each<[string, [number, number, number][], RegExp]>([
    ["too few samples", [[0, 0, 1], [1, 0, 1]], /Insufficient contour samples/],
    ["an invalid depth", [[0, 0, 1], [1, 0, 1], [0, 1, 1600]], /Invalid contour depths/],
    ["only conflicting or dry samples", [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 1, 1]], /Insufficient unambiguous/],
    ["collinear samples", [[0, 0, 1], [1, 0, 2], [2, 0, 3]], /Degenerate contour geometry/],
  ])("rejects %s like the Python grid", (_name, points, message) => {
    expect(() => tinGridMetres(points, [circle(0, 0, 5)], 1)).toThrow(message);
  });

  it("rejects a water mask without area and grids with no underwater coverage", () => {
    expect(() => waterLayout([[[0, 0], [0, 0], [0, 0]]], 1)).toThrow(/unsupported grid dimensions/);
    expect(() => tinGridMetres([[100, 100, 1], [101, 100, 1], [100, 101, 1]], [circle(0, 0, 5)], 1)).toThrow(/No gridded underwater coverage/);
  });
});

describe("harmonicGridMetres", () => {
  const lake = circle(0, 0, 500);
  const layout = waterLayout([lake], 10);
  const mask = fillRings([lake], layout);
  const rings: GridContour[] = [2, 4, 6].map((depthM, index) => ({ depthM, line: circle(0, 0, 400 - index * 120), closed: true }));

  const sample = (values: Float32Array, x: number, y: number) =>
    values[Math.floor((layout.top - y) / layout.resolution) * layout.width + Math.floor((x - layout.left) / layout.resolution)]!;

  it("honours contours, stays within neighbouring contour depths, and deepens monotonically inward", () => {
    const values = harmonicGridMetres({ layout, mask, contours: rings, spots: [] });
    expect(sample(values, 400, 0)).toBeCloseTo(2, 5);
    expect(sample(values, 198, -198)).toBeCloseTo(4, 5);
    const profile = [480, 420, 340, 250, 150, 50].map((x) => sample(values, x, 5));
    for (let index = 1; index < profile.length; index += 1) expect(profile[index]!).toBeGreaterThan(profile[index - 1]!);
    const between = sample(values, 340, 0);
    expect(between).toBeGreaterThan(2);
    expect(between).toBeLessThan(4);
    expect(Number.isNaN(sample(values, 499, 499))).toBe(true);
  });

  it("pins a pool enclosed by one ring half an interval deeper, or shallower for a hump", () => {
    const deeper = harmonicGridMetres({ layout, mask, contours: rings, spots: [] });
    expect(sample(deeper, 0, 0)).toBeCloseTo(7, 1);
    const hump = harmonicGridMetres({ layout, mask, contours: rings.map((ring, index) => index === 2 ? { ...ring, inside: "shallower" as const } : ring), spots: [] });
    expect(sample(hump, 0, 0)).toBeCloseTo(5, 1);
    const coarser = harmonicGridMetres({ layout, mask, contours: rings, spots: [], intervalM: 4 });
    expect(sample(coarser, 0, 0)).toBeCloseTo(8, 1);
  });

  it("lets a spot sounding set the bottom of a pool", () => {
    const values = harmonicGridMetres({ layout, mask, contours: rings, spots: [{ x: 5, y: 5, depthM: 11 }] });
    expect(sample(values, 5, 5)).toBeCloseTo(11, 5);
    // A dome, not a spike: cells beside the sounding are nearly as deep.
    expect(sample(values, 15, 5)).toBeGreaterThan(10.5);
    expect(sample(values, 30, 5)).toBeGreaterThan(sample(values, 100, 5));
    expect(sample(values, 100, 5)).toBeGreaterThan(6);
  });

  it("keeps islands dry and slopes a lake with no inner contours from the shore", () => {
    const withIsland = [lake, circle(250, 0, 60)];
    const islandLayout = waterLayout(withIsland, 10);
    const values = harmonicGridMetres({ layout: islandLayout, mask: fillRings(withIsland, islandLayout), contours: [{ depthM: 3, line: circle(-100, 0, 150), closed: true }], spots: [] });
    expect(Number.isNaN(sample(values, 250, 0))).toBe(true);
    expect(sample(values, 180, 0)).toBeLessThan(sample(values, 60, 0));
  });

  it("rejects invalid depths", () => {
    expect(() => harmonicGridMetres({ layout, mask, contours: [{ depthM: -1, line: circle(0, 0, 100) }], spots: [] })).toThrow(/Invalid contour depths/);
    expect(() => harmonicGridMetres({ layout, mask, contours: rings, spots: [{ x: 0, y: 0, depthM: Number.NaN }] })).toThrow(/Invalid spot depth/);
  });
});

describe("inferIntervalM", () => {
  it("finds the common step between contour levels", () => {
    expect(inferIntervalM([1.524, 3.048, 4.572, 6.096, 3.048])).toBeCloseTo(1.524);
    expect(inferIntervalM([2, 4, 6, 10])).toBe(2);
    expect(inferIntervalM([5])).toBeUndefined();
  });
});

describe("gridDepths", () => {
  const frame = localFrame(-84.72, 44.63);
  const toLonLat = (ring: Point2[]) => ring.map(([x, y]) => frame.toLonLat(x, y));
  const request = {
    water: { outer: toLonLat(circle(0, 0, 600)), holes: [toLonLat(circle(300, 0, 40))] },
    contours: [3, 6].map((depthM, index) => ({ depthM, line: toLonLat(circle(0, 0, 450 - index * 200)), closed: true })),
    spots: [{ lon: frame.toLonLat(0, 0)[0], lat: frame.toLonLat(0, 0)[1], depthM: 9 }],
    resolutionM: 10,
  };

  it("returns a north-up lon/lat grid covering the lake", () => {
    const grid = gridDepths(request);
    expect(grid).toMatchObject({ method: "harmonic", width: 120, height: 120 });
    expect(grid.resolutionM).toBeCloseTo(10, 6);
    expect(grid.bounds.west).toBeLessThan(-84.72);
    expect(grid.bounds.east).toBeGreaterThan(-84.72);
    expect(grid.bounds.north - grid.bounds.south).toBeCloseTo(1200 / frame.scaleY, 6);
    const centre = grid.depthsM[60 * 120 + 60]!;
    expect(centre).toBeCloseTo(9, 0);
    expect(Number.isNaN(grid.depthsM[0]!)).toBe(true);
  });

  it("coarsens to the maximum side and supports the TIN method", () => {
    expect(gridDepths({ ...request, maxSide: 50 })).toMatchObject({ width: 50, height: 50 });
    const tin = gridDepths({ ...request, method: "tin" });
    expect(tin.method).toBe("tin");
    expect(tin.depthsM[60 * 120 + 60]!).toBeCloseTo(9, 0);
  });

  it("takes water as tiles of rings filled even-odd, as a vector chart draws it", () => {
    // The lake split into a west and an east tile, plus an island ring.
    const west = toLonLat([[-600, -600], [0, -600], [0, 600], [-600, 600]]);
    const east = toLonLat([[0, -600], [600, -600], [600, 600], [0, 600]]);
    const island = toLonLat(circle(300, 0, 40));
    const grid = gridDepths({ ...request, water: { rings: [west, east, island] } });
    expect(grid).toMatchObject({ width: 120, height: 120 });
    // Both tiles are water; the island is not.
    expect(Number.isNaN(grid.depthsM[60 * 120 + 10]!)).toBe(false);
    expect(Number.isNaN(grid.depthsM[60 * 120 + 110]!)).toBe(false);
    expect(Number.isNaN(grid.depthsM[60 * 120 + 90]!)).toBe(true);
    expect(() => gridDepths({ ...request, water: { rings: [[[0, 0], [1, 1]]] } })).toThrow(/outline/);
  });

  it("rejects unusable requests", () => {
    expect(() => gridDepths({ ...request, resolutionM: 0 })).toThrow(/resolution/);
    expect(() => gridDepths({ ...request, water: { outer: request.water.outer.slice(0, 2) } })).toThrow(/outline/);
  });
});
