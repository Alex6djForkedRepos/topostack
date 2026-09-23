import { describe, expect, it } from "vitest";
import { decodeChartDepths } from "@topostack/data-contracts/chart-bathymetry";
import { buildChartFromImage, chartId, shorelineFor, type ChartImage } from "$lib/domain/chart-build";

/** An ellipse, as chart pixels or as ground coordinates. */
const ellipse = (cx: number, cy: number, rx: number, ry: number, count = 180): [number, number][] =>
  Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;
    return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)] as [number, number];
  });

/** A white page with black rings drawn on it, as a scanned chart looks. */
function drawChart(rings: [number, number][][], width = 360, height = 280): ChartImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const ink = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const at = (py * width + px) * 4;
      data[at] = 20; data[at + 1] = 20; data[at + 2] = 20;
    }
  };
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index += 1) {
      const [x1, y1] = ring[index]!;
      const [x2, y2] = ring[(index + 1) % ring.length]!;
      const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
      for (let step = 0; step <= steps; step += 1) ink(x1 + ((x2 - x1) * step) / steps, y1 + ((y2 - y1) * step) / steps);
    }
  }
  return { width, height, data };
}

// A lake on the ground, and the same lake drawn on a chart: the shore plus two
// inner contours. About 0.02 degrees across, near 45 N.
const shoreOnGround = ellipse(-80, 45, 0.014, 0.009);
const image = drawChart([ellipse(180, 140, 140, 90), ellipse(180, 140, 95, 61), ellipse(180, 140, 50, 32)]);

const request = {
  image,
  lake: { name: "Round Lake", hylakId: 9092, outline: shoreOnGround },
  units: "m" as const,
  labels: "depth" as const,
  interval: 5,
  // Two labels, because one cannot say which way is deeper: with a single
  // labelled ring and no marked shore, inward and outward are both consistent.
  words: [
    { text: "5", left: 180, top: 74, right: 190, bottom: 84, angle: 0, length: 10, height: 10 },
    { text: "10", left: 178, top: 103, right: 192, bottom: 113, angle: 0, length: 14, height: 10 },
  ],
  resolutionM: 25,
  title: "Round Lake depth map",
  attestation: "own-work" as const,
  fileSha256: "a".repeat(64),
  tool: "chart-trace@test",
};

/**
 * Each of these traces, snaps and grids a whole chart, some more than once.
 * That is a second or two here and several times that under CI's coverage
 * instrumentation, past vitest's default of five seconds.
 */
const SLOW_TRACE_MS = 60_000;

describe("buildChartFromImage", () => {
  it("traces, places and grids an uploaded chart", () => {
    const { record, report } = buildChartFromImage(request, () => 0.5);
    expect(record.id).toMatch(/^round-lake-chart-[0-9a-f]{8}$/);
    expect(record.lake.hylakId).toBe(9092);
    expect(record.georef.method).toBe("snap");
    // The drawn shore is the lake's own shape, so the snap should be close.
    expect(report.iou).toBeGreaterThan(0.9);
    expect(report.snapUncertain).toBe(false);
    expect(record.contours.length).toBeGreaterThanOrEqual(2);
    // Depths nest: the innermost ring is the deepest.
    const depths = record.contours.map((contour) => contour.depthM).sort((a, b) => a - b);
    expect(depths[0]!).toBeGreaterThanOrEqual(0);
    expect(depths.at(-1)!).toBeGreaterThan(depths[0]!);
    const grid = decodeChartDepths(record.grid);
    const covered = Array.from(grid).filter((depth) => !Number.isNaN(depth));
    expect(covered.length).toBeGreaterThan(50);
    expect(Math.max(...covered)).toBeGreaterThanOrEqual(depths.at(-1)!);
    expect(report.waterCells).toBe(covered.length);
  }, SLOW_TRACE_MS);

  it("levels a chart from depths clicked on the steep sides of its contours", () => {
    // Clicks carry no reading direction, and a box erased around a point on a
    // line cuts it; marks do neither, so any part of a contour takes a depth.
    const { record, report } = buildChartFromImage({
      ...request,
      words: undefined,
      marks: [{ x: 275, y: 140, value: 5, reach: 6 }, { x: 131, y: 141, value: 10, reach: 6 }],
    });
    expect(report.coverage).toBe(1);
    expect(record.contours.map((contour) => contour.depthM).sort((a, b) => a - b)).toEqual([0, 5, 10]);
  }, SLOW_TRACE_MS);

  it("offers another placement for a lake that fits its chart more than one way", () => {
    // Round Lake is an ellipse: turned half round it fits just as well.
    const first = buildChartFromImage(request);
    expect(first.report.ambiguous).toBe(true);
    expect(first.report.placements).toBeGreaterThan(1);
    expect(first.report.placement).toBe(0);
    const second = buildChartFromImage({ ...request, placement: 1 });
    expect(second.report.placement).toBe(1);
    expect(second.record.georef.matrix).not.toEqual(first.record.georef.matrix);
    // Asking past the end takes the last placement rather than failing.
    expect(buildChartFromImage({ ...request, placement: 99 }).report.placement).toBe(first.report.placements - 1);
  }, SLOW_TRACE_MS);

  it("asks for the surface elevation rather than failing on negative depths", () => {
    expect(() => buildChartFromImage({ ...request, labels: "elevation", surface: Number.NaN })).toThrow(/surface elevation/);
  });

  it("says what to fix when there is nothing to trace or no lake to place against", () => {
    const blank = { width: 40, height: 40, data: new Uint8ClampedArray(40 * 40 * 4).fill(255) };
    expect(() => buildChartFromImage({ ...request, image: blank })).toThrow(/No lines were traced/);
    expect(() => buildChartFromImage({ ...request, lake: { ...request.lake, outline: [] } })).toThrow(/no outline/);
  });

  it("refuses a chart whose lines carry no level", () => {
    expect(() => buildChartFromImage({ ...request, words: [], interval: undefined })).toThrow(/interval/);
    expect(() => buildChartFromImage({ ...request, words: [] }), "said in the maker's terms, without record ids").toThrow(/^The placed depths/);
  });

  it("levels every ring from two labels, and leaves the rest unlevelled from one", () => {
    const { report } = buildChartFromImage(request, () => 0.5);
    expect(report.coverage).toBe(1);
    // One label leaves the direction open: deeper inward and outward both fit.
    const single = buildChartFromImage({ ...request, words: [request.words[0]!] }, () => 0.5);
    expect(single.report.coverage).toBeLessThan(0.5);
  }, SLOW_TRACE_MS);
});

describe("shorelineFor", () => {
  it("takes the longest closed line, then the longest line of any kind", () => {
    const big = ellipse(0, 0, 100, 100, 32);
    const small = ellipse(0, 0, 10, 10, 32);
    expect(shorelineFor({ shoreline: [], contours: [{ points: small, closed: true }, { points: big, closed: true }] })).toBe(big);
    // Nothing closed: the longest open line still stands in for the shore.
    expect(shorelineFor({ shoreline: [], contours: [{ points: small, closed: false }, { points: big, closed: false }] })).toBe(big);
    expect(shorelineFor({ shoreline: [big], contours: [{ points: small, closed: true }] })).toBe(big);
    expect(shorelineFor({ shoreline: [], contours: [] })).toBeUndefined();
  });
});

describe("chartId", () => {
  it("names a chart after its lake and keeps two traces apart", () => {
    expect(chartId("Lac de Joux", () => 0)).toBe("lac-de-joux-chart-00000000");
    expect(chartId(undefined, () => 0.5)).toMatch(/^lake-chart-[0-9a-f]{8}$/);
    expect(chartId("!!", () => 0)).toBe("lake-chart-00000000");
    expect(chartId("x".repeat(80), () => 0).length).toBeLessThanOrEqual(64);
  });
});
