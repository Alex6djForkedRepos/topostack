import { describe, expect, it } from "vitest";
import { ring } from "./fixtures/synthetic-chart.ts";
import { inferLevels, type LevelLine } from "./levels.ts";

const fractions = [0.8, 0.6, 0.4, 0.2];
const lines = (known: Record<number, number>): LevelLine[] => fractions.map((fraction, index) => ({ points: ring(fraction), closed: true, ...(index in known ? { value: known[index]! } : {}) }));
const base = { interval: 5, width: 1200, height: 1000, cellSize: 1 };

describe("inferLevels", () => {
  it("fills every unlabelled depth contour from one label and the shore", () => {
    const result = inferLevels({ ...base, lines: lines({ 1: 10 }), shoreline: { rings: [ring(1)], value: 0 }, inward: 1 });
    expect(result.values).toEqual([5, 10, 15, 20]);
    expect(result.inferred).toEqual([true, false, true, true]);
    expect(result.conflicts).toEqual([]);
    expect(result.regions.banded).toBeGreaterThanOrEqual(4);
  });

  it("handles elevations and a surface that is not on the contour ladder", () => {
    // A reservoir at 322 ft with 5 ft contours: 320, 315, 310, 305 inward.
    const result = inferLevels({ ...base, lines: lines({ 2: 310 }), shoreline: { rings: [ring(1)], value: 322 }, inward: -1 });
    expect(result.values).toEqual([320, 315, 310, 305]);
  });

  it("works from two labels without a shoreline, carrying the trend inward past the last label", () => {
    const result = inferLevels({ ...base, lines: lines({ 0: 5, 2: 15 }), inward: 1 });
    expect(result.values.slice(0, 3)).toEqual([5, 10, 15]);
    // 15 parts the 10-15 band from the 15-20 band, so the ring inside is 20.
    expect(result.values[3]).toBe(20);
  });

  it("reports a label no band around it agrees with", () => {
    const result = inferLevels({ ...base, lines: lines({ 0: 5, 1: 10, 2: 15, 3: 30 }), shoreline: { rings: [ring(1)], value: 0 }, inward: 1 });
    expect(result.conflicts).toContain(3);
    expect(result.conflicts).not.toContain(0);
  });

  it("leaves lines alone when nothing constrains them, and rejects a bad interval", () => {
    const result = inferLevels({ ...base, lines: lines({}), inward: 1 });
    expect(result.values).toEqual([undefined, undefined, undefined, undefined]);
    expect(() => inferLevels({ ...base, interval: 0, lines: [], inward: 1 })).toThrow(/positive contour interval/);
  });

  it("levels a leaky scan from the facing graph and keeps the frame outside the shore unlevelled", () => {
    // Every ring broken somewhere, so the space between all of them is one
    // leaking region; only the local facing of lines can place them.
    const fractions = [1, 0.8, 0.6, 0.4, 0.2];
    const broken = fractions.map((fraction, index): LevelLine => {
      const points = ring(fraction);
      const start = Math.floor(((index * 47) % 100) / 100 * points.length);
      const kept = [...points.slice(start + 8), ...points.slice(0, start)];
      return { points: kept, closed: false };
    });
    broken[1]!.value = 5;
    broken[3]!.value = 15;
    const frame: LevelLine = { points: [[20, 20], [1180, 20], [1180, 980], [20, 980]], closed: true };
    const result = inferLevels({ ...base, lines: [...broken, frame], inward: 1, surface: 0 });
    expect(result.regions.banded).toBeLessThan(result.regions.total);
    expect(result.values).toEqual([0, 5, 10, 15, 20, undefined]);
    expect(result.inferred).toEqual([true, false, true, false, true, false]);
  });

  it("votes along open fragments that do not close any region", () => {
    // The middle contour is only a stretch of line; regions leak around its ends.
    const partial = lines({ 0: 5, 2: 15 });
    partial[1] = { points: ring(0.6).slice(10, 90), closed: false };
    const result = inferLevels({ ...base, lines: partial, shoreline: { rings: [ring(1)], value: 0 }, inward: 1 });
    expect(result.values[1]).toBe(10);
    expect(result.inferred[1]).toBe(true);
  });
});
