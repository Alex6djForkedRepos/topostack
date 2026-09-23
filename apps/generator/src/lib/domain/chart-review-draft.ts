import type { ChartReview } from "./chart-review";

/** A resumable edit document; never a generation or fabrication approval. */
export interface ChartReviewDraftFile {
  schema: "chart-review-draft-v1";
  source: { sha256: string; page: number; width: number; height: number; units: "m" | "ft" | "fathom"; reads: "depth" | "elevation"; surface: string; interval: string };
  review: ChartReview;
}
export function parseReviewDraft(text: string, source: Pick<ChartReviewDraftFile["source"], "sha256" | "page" | "width" | "height">): ChartReviewDraftFile {
  if (text.length > 10_000_000) throw new Error("Review draft exceeds the 10 MB limit.");
  const file = JSON.parse(text) as ChartReviewDraftFile;
  if (file?.schema !== "chart-review-draft-v1" || !file.source || !file.review) throw new Error("Choose a contour review draft exported by this editor.");
  if (["sha256", "page", "width", "height"].some(key => file.source[key as keyof typeof source] !== source[key as keyof typeof source])) throw new Error("This draft belongs to a different source image or PDF page. Upload its original source first.");
  if (!["m", "ft", "fathom"].includes(file.source.units) || !["depth", "elevation"].includes(file.source.reads) || typeof file.source.surface !== "string" || typeof file.source.interval !== "string") throw new Error("Invalid chart units in review draft.");
  const review = file.review;
  if (!Array.isArray(review.contours) || review.contours.length > 5000 || !Array.isArray(review.controlPoints) || review.controlPoints.length > 64 || typeof review.shorelineId !== "string") throw new Error("Invalid review draft geometry.");
  let points = 0;
  const ids = new Set<string>();
  for (const c of review.contours) {
    if (!c || typeof c.id !== "string" || ids.has(c.id) || c.id.length > 100 || !Array.isArray(c.points) || c.points.length < 2 || typeof c.closed !== "boolean" || typeof c.confirmed !== "boolean" || typeof c.excluded !== "boolean" || (c.value !== null && !Number.isFinite(c.value))) throw new Error("Invalid contour in review draft.");
    if ((c.role !== undefined && !["contour", "island"].includes(c.role)) || (c.inside !== undefined && !["deeper", "shallower"].includes(c.inside)) || (c.interiorValue !== undefined && !Number.isFinite(c.interiorValue))) throw new Error("Invalid contour relationship in review draft.");
    ids.add(c.id); points += c.points.length;
    if (points > 200_000 || c.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite))) throw new Error("Invalid or excessive vertices in review draft.");
  }
  for (const point of review.controlPoints) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Invalid alignment point in review draft.");
    // Unfinished coordinate fields round-trip as null in JSON.
    for (const axis of ["lon", "lat"] as const) {
      if (point[axis] === null) point[axis] = Number.NaN;
      else if (!Number.isFinite(point[axis])) throw new Error("Invalid alignment coordinate in review draft.");
    }
  }
  review.alignmentConfirmed = false;
  return file;
}
