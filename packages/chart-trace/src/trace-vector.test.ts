import { describe, expect, it } from "vitest";
import { ring, syntheticChart } from "./fixtures/synthetic-chart.ts";
import { traceVectorChart } from "./trace-vector.ts";

const mapArea = { left: 100, top: 100, right: 1100, bottom: 900 };

describe("traceVectorChart", () => {
  it("recovers every level of a fragmented GIS chart with two contours labelled", () => {
    const chart = syntheticChart({ levels: [5, 10, 15, 20, 25], fractions: [0.84, 0.67, 0.5, 0.33, 0.16], labelled: [1, 3], indexEvery: 2 });
    const trace = traceVectorChart(chart.page, { contourStyles: chart.contourStyles, shorelineStyles: [chart.shorelineStyle], labels: "depth", mapArea });
    expect(trace.interval).toBe(10);
    // The labels alone suggest a 10 ft interval; the maker can correct it.
    const corrected = traceVectorChart(chart.page, { contourStyles: chart.contourStyles, shorelineStyles: [chart.shorelineStyle], labels: "depth", interval: 5, mapArea });
    expect(corrected.contours).toHaveLength(5);
    expect(corrected.contours.every((contour) => contour.closed)).toBe(true);
    // Each traced contour sits where its level was drawn.
    for (const contour of corrected.contours) {
      const index = chart.levels.indexOf(contour.value);
      const [x, y] = ring([0.84, 0.67, 0.5, 0.33, 0.16][index]!)[0]!;
      expect(contour.points.some(([px, py]) => Math.hypot(px - x, py - y) < 1)).toBe(true);
    }
    expect(corrected.diagnostics).toMatchObject({ labels: 4, labelled: 2, inferred: 3, unresolved: 0, labelDisagreements: 0, contradictoryRegions: 0 });
    expect(corrected.diagnostics.coverage).toBe(1);
    expect(corrected.shoreline).toHaveLength(1);
  });

  it("reads a reservoir chart labelled in elevations against its pool level", () => {
    const chart = syntheticChart({ levels: [320, 315, 310, 305], fractions: [0.9, 0.7, 0.5, 0.3], labelled: [1, 2], seed: 4 });
    const trace = traceVectorChart(chart.page, { contourStyles: chart.contourStyles, shorelineStyles: [chart.shorelineStyle], labels: "elevation", surface: 322, mapArea });
    expect(trace.interval).toBe(5);
    expect(trace.contours.map((contour) => contour.value).sort()).toEqual([305, 310, 315, 320]);
  });

  it("reads legend and grid text only when no map area excludes it, and needs its inputs", () => {
    const chart = syntheticChart({ levels: [5, 10], fractions: [0.7, 0.35], labelled: [0, 1] });
    const everywhere = traceVectorChart(chart.page, { contourStyles: chart.contourStyles, labels: "depth" });
    expect(everywhere.diagnostics.labels).toBe(5);
    expect(() => traceVectorChart(chart.page, { contourStyles: [], labels: "depth" })).toThrow(/contour style/);
    expect(() => traceVectorChart(chart.page, { contourStyles: chart.contourStyles, labels: "elevation" })).toThrow(/surface elevation/);
    const unlabelled = syntheticChart({ levels: [5, 10], fractions: [0.7, 0.35], labelled: [] });
    expect(() => traceVectorChart(unlabelled.page, { contourStyles: chart.contourStyles, labels: "depth" })).toThrow(/contour interval/);
  });
});
