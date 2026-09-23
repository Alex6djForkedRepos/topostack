import { describe, expect, it } from "vitest";
import { blank, ellipse, label, stroke } from "./fixtures/synthetic-scan.ts";
import type { Point2 } from "./local-frame.ts";
import { darkMask, thin, type Mask } from "./raster.ts";
import { heavyWidth, simplify, skeletonLines, traceRasterChart, traceScannedChart, withoutLines, type ChartWord } from "./trace-raster.ts";

function skeletonOf(width: number, height: number, lines: { points: Point2[]; closed?: boolean; width?: number }[]): Mask {
  const image = blank(width, height);
  for (const line of lines) stroke(image, line.points, line.closed ?? false, line.width ?? 3);
  return thin(darkMask(image));
}

describe("skeletonLines", () => {
  it("splits a Y into its three branches and keeps a ring closed", () => {
    const y = skeletonLines(skeletonOf(100, 100, [{ points: [[50, 10], [50, 50]] }, { points: [[50, 50], [15, 90]] }, { points: [[50, 50], [85, 90]] }]), undefined);
    expect(y).toHaveLength(3);
    expect(y.every((line) => line.points.length > 20 && !line.closed)).toBe(true);
    const ring = skeletonLines(skeletonOf(100, 100, [{ points: ellipse(50, 50, 35, 25), closed: true }]), undefined);
    expect(ring).toHaveLength(1);
    expect(ring[0]!.closed).toBe(true);
  });

  it("prunes a short spur so the line runs on through it", () => {
    const lines = skeletonLines(skeletonOf(100, 40, [{ points: [[5, 20], [95, 20]] }, { points: [[50, 20], [50, 24]] }]), undefined, 8);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.points.length).toBeGreaterThan(80);
  });

  it("measures stroke width along each line", () => {
    const image = blank(120, 60);
    stroke(image, [[10, 15], [110, 15]], false, 3);
    stroke(image, [[10, 45], [110, 45]], false, 9);
    const mask = darkMask(image);
    const widths = skeletonLines(thin(mask), (await_distance(mask))).map((line) => line.width).sort((a, b) => a - b);
    expect(widths[0]!).toBeLessThan(5);
    expect(widths[1]!).toBeGreaterThan(7);
  });
});

// inkDistance lives in raster.ts; a local alias keeps the test above readable.
import { inkDistance } from "./raster.ts";
function await_distance(mask: Mask): Float32Array {
  return inkDistance(mask);
}

describe("simplify and heavyWidth", () => {
  it("drops points within tolerance of the line through their neighbours", () => {
    expect(simplify([[0, 0], [1, 0.1], [2, -0.1], [3, 0], [3, 5]], 0.5)).toEqual([[0, 0], [3, 0], [3, 5]]);
    expect(simplify([[0, 0], [1, 1]], 1)).toEqual([[0, 0], [1, 1]]);
  });

  it("finds a clearly heavier class of lines, and none when widths are alike", () => {
    const line = (y: number, width: number) => ({ points: [[0, y], [500, y]] as Point2[], closed: false, width });
    const split = heavyWidth([line(0, 2), line(10, 2.2), line(20, 1.9), line(30, 6)]);
    expect(split).toBeGreaterThan(2.2);
    expect(split).toBeLessThan(6);
    expect(heavyWidth([line(0, 2), line(10, 2.2), line(20, 2.1)])).toBeUndefined();
    expect(heavyWidth([])).toBeUndefined();
  });

  it("removes long lines' ink and keeps small marks", () => {
    const image = blank(120, 40);
    stroke(image, [[5, 20], [115, 20]], false, 3);
    stroke(image, [[60, 30], [64, 30]], false, 3);
    const mask = darkMask(image);
    const residual = withoutLines(mask, skeletonLines(thin(mask), inkDistance(mask)), 30);
    let kept = 0;
    for (let x = 0; x < 120; x += 1) kept += residual.data[20 * 120 + x]!;
    expect(kept).toBe(0);
    expect(residual.data[30 * 120 + 62]).toBe(1);
  });
});

/** A 600x500 scanned lake: a bold shore and three thin contours. */
function lakeScan(bold = true) {
  const image = blank(600, 500);
  const rings = [1, 0.75, 0.5, 0.25].map((fraction) => ellipse(300, 250, 250 * fraction, 180 * fraction, 240));
  stroke(image, rings[0]!, true, bold ? 7 : 3);
  for (const ring of rings.slice(1)) stroke(image, ring, true, 3);
  return { image, rings };
}

function wordOn(ring: Point2[], at: number, text: string): ChartWord {
  const [x, y] = ring[Math.floor(at * ring.length)]!;
  return { text, left: x - 8, top: y - 6, right: x + 8, bottom: y + 6 };
}

describe("traceRasterChart", () => {
  it("traces a scan into leveled contours from one given label, finding the bold shore", () => {
    const { image, rings } = lakeScan();
    const trace = traceRasterChart(image, { labels: "depth", interval: 5, shoreline: "auto", words: [wordOn(rings[2]!, 0.3, "10")] });
    expect(trace.scale).toBe(1);
    expect(trace.lines.filter((line) => line.shoreline)).not.toHaveLength(0);
    expect(trace.contours.map((contour) => contour.value).sort((a, b) => a - b)).toEqual([5, 10, 15]);
    expect(trace.diagnostics.coverage).toBeGreaterThan(0.95);
  });

  it("infers the shore as depth 0 when every line is traced as a contour", () => {
    const { image, rings } = lakeScan(false);
    const trace = traceRasterChart(image, { labels: "depth", interval: 5, words: [wordOn(rings[1]!, 0.6, "5"), wordOn(rings[3]!, 0.1, "15")] });
    expect(trace.lines.some((line) => line.shoreline)).toBe(false);
    expect(trace.contours.map((contour) => contour.value).sort((a, b) => a - b)).toEqual([0, 5, 10, 15]);
  });

  it("traces chosen coloured ink only and downsamples large scans", () => {
    const image = blank(900, 300);
    stroke(image, ellipse(450, 150, 400, 120, 200), true, 4, [20, 90, 210]);
    stroke(image, ellipse(450, 150, 200, 60, 200), true, 4, [0, 0, 0]);
    const trace = traceRasterChart(image, { labels: "depth", interval: 5, ink: { colours: [[20, 90, 210]] }, maxSide: 450 });
    expect(trace.scale).toBeCloseTo(2, 6);
    expect(trace.lines).toHaveLength(1);
    // Lines come back in original pixels.
    expect(Math.max(...trace.lines[0]!.points.map(([x]) => x))).toBeGreaterThan(820);
  });
});

describe("traceScannedChart", () => {
  it("finds the labels printed in the contour gaps and traces the lines without them", async () => {
    const { image, rings } = lakeScan(false);
    const put = (ring: Point2[], at: number, count: number) => {
      const index = Math.floor(at * ring.length);
      const [x1, y1] = ring[index]!;
      const [x2, y2] = ring[index + 1]!;
      label(image, x1, y1, Math.atan2(y2 - y1, x2 - x1), count);
      // The maker clicks the line a little way along from its printed number.
      // A mark's reach also sets how wide a gap is bridged; 20 px is about what
      // the studio's 12 screen pixels come to on an upload this size.
      return ring[(index + 8) % ring.length]!;
    };
    const five = put(rings[1]!, 0.1, 1);
    const ten = put(rings[2]!, 0.55, 2);
    const trace = traceScannedChart(image, { labels: "depth", interval: 5, glyph: { min: 6, max: 20 }, marks: [{ x: five[0], y: five[1], value: 5, reach: 20 }, { x: ten[0], y: ten[1], value: 10, reach: 20 }] });
    // Both printed labels are found, and none of the digits traced as a line of its own.
    expect(trace.candidates.length).toBeGreaterThanOrEqual(2);
    expect(trace.contours.map((contour) => contour.value).sort((a, b) => a - b)).toEqual([0, 5, 10, 15]);
  });

  it("levels from the words given, as the batch places them", async () => {
    const { image, rings } = lakeScan(false);
    const trace = traceScannedChart(image, { labels: "depth", interval: 5, words: [wordOn(rings[2]!, 0.3, "10")] });
    expect(trace.contours.some((contour) => contour.value === 10)).toBe(true);
  });
});
