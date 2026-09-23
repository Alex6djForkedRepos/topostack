import { expect, it } from "vitest";
import { parseReviewDraft, type ChartReviewDraftFile } from "./chart-review-draft";
import { reviewFixture } from "./testing/chart-review-fixture";
const source = { sha256: "a".repeat(64), page: 0, width: 100, height: 100, units: "m" as const, reads: "depth" as const, surface: "", interval: "5" };
const file = (): ChartReviewDraftFile => ({ schema: "chart-review-draft-v1", source, review: reviewFixture().review });
it("restores edits but requires fresh alignment and layer review", () => {
  const restored = parseReviewDraft(JSON.stringify(file()), source);
  expect(restored.review.contours).toEqual(file().review.contours);
  expect(restored.review.alignmentConfirmed).toBe(false);
});
it("rejects a different source/page and malformed geometry", () => {
  expect(() => parseReviewDraft(JSON.stringify(file()), { ...source, page: 2 })).toThrow(/different source/);
  const broken = file(); broken.review.contours[0]!.points = [[Number.NaN, 0]];
  expect(() => parseReviewDraft(JSON.stringify(broken), source)).toThrow(/contour|vertices/);
});
