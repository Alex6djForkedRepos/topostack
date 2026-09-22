import { describe, expect, it } from "vitest";
import { blank, fakeRecognizer, label, stroke } from "./fixtures/synthetic-scan.ts";
import type { Point2 } from "./local-frame.ts";
import { darkMask } from "./raster.ts";
import { bulgeCandidates, labelCandidates, mergeCandidates, readLabels, uprightCrop, type LabelCandidate } from "./raster-labels.ts";

describe("labelCandidates", () => {
  it("groups nearby glyphs into one label read along their centres", () => {
    const image = blank(200, 100);
    label(image, 60, 50, Math.PI / 6, 3);
    stroke(image, [[150, 20], [160, 20]], false, 2);
    stroke(image, [[10, 90], [190, 90]], false, 2);
    const candidates = labelCandidates(darkMask(image), [], 6, 20);
    expect(candidates).toHaveLength(1);
    const [only] = candidates;
    expect(only!.x).toBeCloseTo(60, -1);
    // Half a turn is ambiguous; the direction matches either way.
    expect(Math.abs(Math.sin(only!.angle - Math.PI / 6))).toBeLessThan(0.15);
  });

  it("reads a lone glyph along the nearest line", () => {
    const image = blank(200, 100);
    label(image, 100, 50, 0, 1);
    const line: Point2[] = [[20, 60], [180, 20]];
    const [candidate] = labelCandidates(darkMask(image), [{ points: line }], 6, 20);
    expect(Math.abs(Math.sin(candidate!.angle - Math.atan2(-40, 160)))).toBeLessThan(0.05);
    expect(labelCandidates(darkMask(image), [], 6, 20)[0]!.angle).toBe(0);
  });
});

describe("bulgeCandidates", () => {
  it("finds where a line's stroke swells to label size, reading along the line", () => {
    const points = Array.from({ length: 120 }, (_, index): Point2 => [index, index * 0.5]);
    const widths = points.map((_, index) => (index >= 55 && index <= 70 ? 10 : 3));
    const [candidate, ...rest] = bulgeCandidates([{ points, widths }, { points: points.slice(0, 5) }], 6, 20);
    expect(rest).toEqual([]);
    expect(candidate!.x).toBeCloseTo(62.5, 0);
    expect(candidate!.angle).toBeCloseTo(Math.atan2(0.5, 1), 2);
    expect(candidate!.glyph).toBeCloseTo(13, 0);
    expect(bulgeCandidates([{ points, widths: points.map(() => 3) }], 6, 20)).toEqual([]);
  });
});

describe("mergeCandidates", () => {
  const box = (left: number, top: number, size: number): LabelCandidate => ({ left, top, right: left + size, bottom: top + size, x: left + size / 2, y: top + size / 2, glyph: size, angle: 0 });

  it("keeps the first of overlapping candidates", () => {
    expect(mergeCandidates([box(0, 0, 10)], [box(2, 2, 10), box(40, 40, 10)])).toEqual([box(0, 0, 10), box(40, 40, 10)]);
  });
});

describe("uprightCrop and readLabels", () => {
  it("turns a rotated region upright and enlarges it", () => {
    const image = blank(100, 100);
    stroke(image, [[50, 30], [50, 70]], false, 3);
    // Reading along the vertical bar makes it horizontal in the crop.
    const crop = uprightCrop(image, 50, 50, 50, 10, Math.PI / 2, 2);
    expect([crop.width, crop.height]).toEqual([100, 20]);
    const middle = (x: number) => crop.data[(10 * crop.width + x) * 4]!;
    expect(middle(50)).toBeLessThan(80);
    expect(middle(95)).toBe(255);
  });

  it("reads each candidate both ways up and keeps confident, parseable readings", async () => {
    const image = blank(240, 120);
    label(image, 70, 60, 0.4, 2);
    label(image, 170, 60, -2.5, 1);
    // The lone glyph takes its direction from the contour it sits on.
    const contour: Point2[] = [[170 - 40 * Math.cos(-2.5), 70 - 40 * Math.sin(-2.5)], [170 + 40 * Math.cos(-2.5), 70 + 40 * Math.sin(-2.5)]];
    const candidates = labelCandidates(darkMask(image), [{ points: contour }], 6, 20);
    const recognize = fakeRecognizer({ 1: "5'", 2: "10" });
    const read = await readLabels(image, candidates, 1, recognize);
    expect(recognize.calls).toBe(4);
    expect(read.map((label) => label.value).sort((a, b) => a - b)).toEqual([5, 10]);
    const ten = read.find((label) => label.value === 10)!;
    expect(Math.cos(ten.angle - 0.4)).toBeGreaterThan(0.95);
    expect(ten.length).toBeGreaterThan(ten.height);
    // Unparseable or doubtful readings are dropped.
    expect(await readLabels(image, candidates, 1, async () => ({ text: "Lake", confidence: 99 }))).toEqual([]);
    expect(await readLabels(image, candidates, 1, async () => ({ text: "10", confidence: 30 }))).toEqual([]);
  });
});
