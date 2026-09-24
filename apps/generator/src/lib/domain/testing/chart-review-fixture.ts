import type { ChartBuildRequest } from "$lib/domain/chart-build";
import type { ChartReview, ReviewContour } from "$lib/domain/chart-review";

export const square = (id: string, inset: number, value: number | null): ReviewContour => ({ id, points: [[inset, inset], [100-inset, inset], [100-inset, 100-inset], [inset, 100-inset]], value, closed: true, confirmed: true, excluded: false });
export function reviewFixture(): { review: ChartReview; request: ChartBuildRequest } {
  const controlPoints = [{ x: 0, y: 0, lon: -80, lat: 45.01 }, { x: 100, y: 0, lon: -79.99, lat: 45.01 }, { x: 100, y: 100, lon: -79.99, lat: 45 }, { x: 0, y: 100, lon: -80, lat: 45 }];
  const review: ChartReview = { contours: [square("shore", 0, null), square("shallow", 15, 5), square("deep", 35, 10)], shorelineId: "shore", controlPoints, alignmentConfirmed: true };
  const request: ChartBuildRequest = { image: { width: 100, height: 100, data: new Uint8ClampedArray(40000) }, lake: { name: "Review lake", outline: controlPoints.map(p => [p.lon, p.lat]) }, units: "m", labels: "depth", interval: 5, resolutionM: 20, title: "Reviewed chart", attestation: "own-work", fileSha256: "a".repeat(64), tool: "test", review };
  return { review, request };
}
