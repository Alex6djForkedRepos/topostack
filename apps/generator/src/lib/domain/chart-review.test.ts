import { describe, expect, it } from "vitest";
import { buildChartFromImage } from "./chart-build";
import { joinReviewContours, prepareChartReview, reviewAlignment, reviewGeometryIssues } from "./chart-review";
import { parseUserChartBathymetry } from "@topostack/data-contracts/chart-bathymetry";

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
  it.each(["unreviewed", "open", "value", "order", "interval-values", "outside"])("blocks %s even when generation is called directly", code => {
    const { request, review } = reviewFixture(); const c = review.contours[2]!;
    if (code === "unreviewed") c.confirmed = false;
    if (code === "open") c.closed = false;
    if (code === "value") c.value = null;
    if (code === "order") c.value = 5;
    if (code === "interval-values") c.value = 7;
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
