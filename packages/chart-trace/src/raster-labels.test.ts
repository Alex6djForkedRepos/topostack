import { describe, expect, it } from "vitest";
import { blank, label, stroke } from "./fixtures/synthetic-scan.ts";
import type { Point2 } from "./local-frame.ts";
import { darkMask } from "./raster.ts";
import { bulgeCandidates, labelCandidates, mergeCandidates, type LabelCandidate } from "./raster-labels.ts";

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
