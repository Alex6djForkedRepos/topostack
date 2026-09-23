import { describe, expect, it } from "vitest";
import { buildChartFromImage } from "./chart-build";
import { joinReviewContours, prepareChartReview, reviewAlignment, reviewGeometryIssues } from "./chart-review";
import { decodeChartDepths, parseUserChartBathymetry } from "@topostack/data-contracts/chart-bathymetry";

import { reviewFixture, square } from "./testing/chart-review-fixture";

describe("first release contour review", () => {
  it("builds exactly the reviewed paths, with no image retracing or inferred values", () => {
    const { request } = reviewFixture();
    const result = buildChartFromImage(request, () => .1);
    expect(result.record.contours.map(c => c.depthM)).toEqual([5, 10]);
    expect(result.record.georef.method).toBe("control-points");
    expect(result.report.inferred).toBe(0);
    expect(result.report.iou).toBeGreaterThan(.99);
    expect(result.record.review).toBeUndefined(); // Layer review still required.
  });
  it("prepares geometry without gridding or silently approving values", () => {
    const { request } = reviewFixture();
    const review = prepareChartReview({ ...request, sourceContours: [square("a", 15, null)], marks: [{ x: 15, y: 20, value: 5, reach: 2 }] });
    expect(review.contours[0]).toMatchObject({ value: 5, confirmed: false });
    expect(review.alignmentConfirmed).toBe(false);
  });
  it("retains conflicting placed values as unresolved", () => {
    const { request } = reviewFixture();
    const review = prepareChartReview({ ...request, sourceContours: [square("a", 15, null)], marks: [5, 10].map(value => ({ x: 15, y: 20, value, reach: 2 })) });
    expect(review.contours[0]!.value).toBeNull();
  });
  it.each(["unreviewed", "open", "value", "order", "outside"])("blocks %s even when generation is called directly", code => {
    const { request, review } = reviewFixture(); const c = review.contours[2]!;
    if (code === "unreviewed") c.confirmed = false;
    if (code === "open") c.closed = false;
    if (code === "value") c.value = null;
    if (code === "order") c.value = 5;
    if (code === "outside") { review.contours[0] = square("shore", 45, null); }
    expect(reviewGeometryIssues(review, request).some(i => i.code === code)).toBe(true);
    expect(() => buildChartFromImage(request)).toThrow();
  });
  it("blocks touching/crossing paths and self intersections", () => {
    const { review, request } = reviewFixture();
    review.contours[2]!.points = [[5,40],[95,40],[95,60],[5,60]];
    expect(reviewGeometryIssues(review, request).some(i => i.code === "crossing")).toBe(true);
  });
  it("requires independent alignment review, distributed points, and a consistent fit", () => {
    const { review, request } = reviewFixture();
    review.alignmentConfirmed = false;
    expect(() => buildChartFromImage(request)).toThrow(/alignment|aligned/);
    review.controlPoints[3]!.lon += .02;
    expect(() => reviewAlignment(review, request.lake.outline)).toThrow(/20 m/);
    review.controlPoints = review.controlPoints.map((p, i) => ({ ...p, x: i, y: i }));
    expect(() => reviewAlignment(review, request.lake.outline)).toThrow(/Spread/);
  });
  it("joins nearest endpoints without confirming the result, and rejects conflicting values", () => {
    const a = { ...square("a", 10, 5), closed: false, points: [[0,0],[10,0]] as [number,number][] };
    const b = { ...a, id: "b", points: [[20,0],[11,0]] as [number,number][] };
    expect(joinReviewContours(a, b)).toMatchObject({ points: [[0,0],[10,0],[11,0],[20,0]], confirmed: false });
    expect(() => joinReviewContours(a, { ...b, value: 10 })).toThrow(/same value/);
  });
  it("round-trips completed receipts and rejects incomplete or incompatible receipts", () => {
    const { request } = reviewFixture();
    const record = buildChartFromImage(request).record;
    const review = { version: 1, profile: "closed-contours-v1", reviewedAt: "2026-09-23T00:00:00.000Z", contours: true, alignment: true, layers: true };
    expect(parseUserChartBathymetry({ ...record, review }).review).toEqual(review);
    expect(() => parseUserChartBathymetry({ ...record, review: { ...review, layers: false } })).toThrow(/review/);
    expect(() => parseUserChartBathymetry({ ...record, review, georef: { ...record.georef, controlPoints: record.georef.controlPoints!.slice(0,3) } })).toThrow(/four control/);
    expect(parseUserChartBathymetry(record).review).toBeUndefined();
  });
});

describe("explicit contour topology", () => {
  it("accepts irregular contour values without an interval and holds the innermost depth", () => {
    const { request, review } = reviewFixture(); delete request.interval;
    review.contours[2]!.value = 7;
    expect(reviewGeometryIssues(review, request)).toEqual([]);
    const result = buildChartFromImage(request);
    expect(result.report.deepestM).toBe(7);
    expect(result.record.intervalM).toBeUndefined();
    expect(result.record.contours[1]!.interiorDepthM).toBe(7);
  });
  it("supports a rise inside a basin and an explicit summit", () => {
    const { request, review } = reviewFixture();
    review.contours.push({ ...square("rise", 42, 6), inside: "shallower", interiorValue: 3 });
    expect(reviewGeometryIssues(review, request)).toEqual([]);
    const result = buildChartFromImage(request);
    expect(result.record.contours.at(-1)).toMatchObject({ depthM: 6, inside: "shallower", interiorDepthM: 3 });
    const grid = decodeChartDepths(result.record.grid);
    const { width, height } = result.record.grid;
    expect(grid[Math.floor(height / 2) * width + Math.floor(width / 2)]!).toBeLessThan(4);
    expect(result.report.deepestM).toBe(10);
  });
  it("preserves island boundaries, masks land and rejects contours within land", () => {
    const { request, review } = reviewFixture();
    review.contours.push({ ...square("island", 42, null), role: "island" });
    expect(reviewGeometryIssues(review, request)).toEqual([]);
    const result = buildChartFromImage(request);
    expect(result.record.lake.islands).toHaveLength(1);
    const grid = decodeChartDepths(result.record.grid);
    const { width, height } = result.record.grid;
    expect(Number.isNaN(grid[Math.floor(height / 2) * width + Math.floor(width / 2)]!)).toBe(true);
    review.contours.push(square("land-line", 46, 20));
    expect(reviewGeometryIssues(review, request).some(i => i.code === "land")).toBe(true);
  });
  it("rejects wrong-direction extrema and extrema on nonterminal contours", () => {
    const { request, review } = reviewFixture();
    review.contours[2]!.interiorValue = 4;
    expect(reviewGeometryIssues(review, request).some(i => i.code === "interior")).toBe(true);
    delete review.contours[2]!.interiorValue;
    review.contours[1]!.interiorValue = 12;
    expect(reviewGeometryIssues(review, request).some(i => i.code === "interior-child")).toBe(true);
  });
});
