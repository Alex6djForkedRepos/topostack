import { chainPaths } from "@topostack/chart-trace/vector-chart";
import { simplify } from "@topostack/chart-trace/trace-raster";
import { apply, fitControlPoints, invert, ringIou, type ControlPoint } from "@topostack/chart-trace/georef";
import type { Point2 } from "@topostack/chart-trace/local-frame";
import { traceRasterChart } from "@topostack/chart-trace/trace-raster";
import { CHART_UNIT_METRES, CHART_BATHYMETRY_LIMITS } from "@topostack/data-contracts/chart-bathymetry";
import type { ChartBuildRequest } from "./chart-build.ts";
import { nearestChartContour } from "./chart-contours.ts";

export interface ReviewContour {
  id: string;
  points: Point2[];
  closed: boolean;
  value: number | null;
  confirmed: boolean;
  excluded: boolean;
}
export interface ChartReview {
  contours: ReviewContour[];
  shorelineId: string;
  controlPoints: ControlPoint[];
  alignmentConfirmed: boolean;
}
export interface ReviewIssue { code: string; message: string; contourIds: string[] }

/** Geometry proposals only. Unassigned paths stay visible until explicitly excluded. */
export function prepareChartReview(request: ChartBuildRequest): ChartReview {
  const lines = request.sourceContours ? chainPaths(request.sourceContours.map(c => ({ ...c, stroke: "#000000", lineWidth: 1, dashed: false })), 0.25).map(c => ({ points: simplify(c.points, 0.25), closed: c.closed })) : traceRasterChart(request.image, { labels: "depth", geometryOnly: true }).selectionContours;
  if (lines.length > 5000) throw new Error("Too many paths to review. Crop the source chart or choose fewer PDF line styles.");
  const contours = lines.map((line, index): ReviewContour => ({ ...line, id: `contour-${index + 1}`, value: null, confirmed: false, excluded: false }));
  const conflicts = new Set<number>();
  for (const mark of request.marks ?? []) {
    const hit = nearestChartContour(contours, mark.x, mark.y, mark.reach);
    if (!hit) continue;
    const line = contours[hit.index]!;
    if (line.value !== null && line.value !== mark.value) conflicts.add(hit.index);
    line.value = mark.value;
  }
  for (const index of conflicts) contours[index]!.value = null;
  return { contours, shorelineId: "", controlPoints: [], alignmentConfirmed: false };
}

export function insideRing(point: Point2, ring: readonly Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

const cross = (a: Point2, b: Point2, c: Point2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const same = (a: Point2, b: Point2) => a[0] === b[0] && a[1] === b[1];
function intersects(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  if (Math.max(a[0], b[0]) < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) < Math.min(a[1], b[1])) return false;
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}
const ring = (c: ReviewContour) => c.points.length > 1 && same(c.points[0]!, c.points.at(-1)!) ? c.points.slice(0, -1) : c.points;

/** Release limits are guards on this supported workflow, not an accuracy certificate. */
export function reviewGeometryIssues(review: ChartReview, request: Pick<ChartBuildRequest, "units" | "labels" | "surface" | "interval" | "image">): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const add = (code: string, message: string, ...contourIds: string[]) => issues.push({ code, message, contourIds });
  if (review.controlPoints.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > request.image.width || p.y > request.image.height)) add("alignment-bounds", "Alignment points must lie on the source image.");
  const active = review.contours.filter(c => !c.excluded);
  if (new Set(review.contours.map(c => c.id)).size !== review.contours.length) add("ids", "Contour identifiers must be unique.");
  const shore = active.find(c => c.id === review.shorelineId);
  if (!shore) add("shore", "Select the complete outer shoreline.");
  if (active.length < 2) add("empty", "Include a shoreline and at least one depth contour.");
  if (active.length > 128 || active.reduce((n, c) => n + c.points.length, 0) > 12000) {
    add("limit", "This release supports at most 128 included paths and 12,000 vertices. Simplify or crop the chart.");
    return issues;
  }
  if (!Number.isFinite(request.interval) || request.interval! <= 0) add("interval", "Enter the positive contour interval printed on the chart.");
  if (request.labels === "elevation" && !Number.isFinite(request.surface)) add("surface", "Enter the chart's water surface elevation.");
  const depth = (c: ReviewContour) => c.id === review.shorelineId ? 0 : (request.labels === "depth" ? c.value! : request.surface! - c.value!) * CHART_UNIT_METRES[request.units];
  for (const c of active) {
    const p = ring(c);
    const area = Math.abs(p.reduce((sum, a, i) => { const b = p[(i + 1) % p.length]!; return sum + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;
    if (!(area > 1)) add("degenerate", "A closed path must enclose an area. Redraw the collapsed contour.", c.id);
    if (!c.confirmed) add("unreviewed", "Confirm this path against the source chart, or exclude it.", c.id);
    if (!c.closed || ring(c).length < 3) add("open", "Join or redraw this path as a complete closed contour. Open contours are outside this release.", c.id);
    if (c.points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > request.image.width || y > request.image.height)) add("bounds", "Contour vertices must lie within the chart image.", c.id);
    if (c !== shore && (c.value === null || !Number.isFinite(c.value) || !(depth(c) > 0) || depth(c) > CHART_BATHYMETRY_LIMITS.maxDepthM)) add("value", "Assign a finite contour value below the water surface.", c.id);
  }
  if (issues.some(i => ["open", "bounds", "value", "surface", "degenerate"].includes(i.code))) return issues;
  const segments = active.flatMap(c => ring(c).map((a, index, points) => ({ c, index, count: points.length, a, b: points[(index + 1) % points.length]! })));
  const reported = new Set<string>();
  // Spatial bins keep review responsive for high-resolution source paths.
  // A deliberately adversarial tangle is rejected instead of monopolizing the UI.
  const cell = Math.max(request.image.width, request.image.height) / 64 || 1;
  const bins = new Map<string, number[]>();
  let comparisons = 0;
  for (let i = 0; i < segments.length; i++) {
    const a = segments[i]!, seen = new Set<number>();
    for (let x = Math.floor(Math.min(a.a[0], a.b[0]) / cell); x <= Math.floor(Math.max(a.a[0], a.b[0]) / cell); x++) {
      for (let y = Math.floor(Math.min(a.a[1], a.b[1]) / cell); y <= Math.floor(Math.max(a.a[1], a.b[1]) / cell); y++) {
        const binKey = `${x}:${y}`, bucket = bins.get(binKey) ?? [];
        for (const j of bucket) {
          if (seen.has(j)) continue;
          seen.add(j);
          const b = segments[j]!;
          if (a.c === b.c && (Math.abs(a.index - b.index) === 1 || Math.abs(a.index - b.index) === a.count - 1)) continue;
          const key = [a.c.id, b.c.id].sort().join(":");
          if (reported.has(key)) continue;
          if (++comparisons > 2_000_000) { add("complexity", "Too many overlapping segments to review safely. Simplify or redraw tangled paths."); return issues; }
          if (intersects(a.a, a.b, b.a, b.b)) { reported.add(key); add("crossing", "Paths cross, touch, or overlap. Repair the geometry before generating depths.", a.c.id, b.c.id); }
        }
        bucket.push(i); bins.set(binKey, bucket);
      }
    }
  }
  const first = active.find(c => c !== shore);
  for (const c of active) {
    if (c === shore) continue;
    if (first && request.interval && Math.abs((c.value! - first.value!) / request.interval - Math.round((c.value! - first.value!) / request.interval)) > 0.01) add("interval-values", "Contour values do not follow the stated interval.", c.id);
    if (shore && !insideRing(c.points[0]!, shore.points)) add("outside", "This contour is outside the shoreline.", c.id);
    for (const outer of active) {
      if (outer === c || outer === shore || !insideRing(c.points[0]!, outer.points)) continue;
      if (depth(c) <= depth(outer)) add("order", "An enclosed contour must be deeper than its surrounding contour. Islands and underwater rises are outside this release.", c.id, outer.id);
    }
  }
  return issues;
}

export function reviewAlignment(review: ChartReview, outline: Point2[]) {
  const points = review.controlPoints;
  if (points.length < 4 || points.length > 64) throw new Error("Add at least four alignment points spread around the lake (maximum 64).");
  if (points.some(p => ![p.x, p.y, p.lon, p.lat].every(Number.isFinite) || Math.abs(p.lon) > 180 || Math.abs(p.lat) > 90 || p.x < 0 || p.y < 0)) throw new Error("Enter valid image positions and WGS84 longitude/latitude for every alignment point.");
  const shore = review.contours.find(c => c.id === review.shorelineId && !c.excluded);
  if (!shore) throw new Error("Select the shoreline before aligning the chart.");
  const xs = shore.points.map(p => p[0]), ys = shore.points.map(p => p[1]);
  const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  let triangle = 0;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) for (let k = j + 1; k < points.length; k++) triangle = Math.max(triangle, Math.abs(cross([points[i]!.x, points[i]!.y], [points[j]!.x, points[j]!.y], [points[k]!.x, points[k]!.y])) / 2);
  if (!(area > 0) || triangle < area * 0.1) throw new Error("Spread alignment points around the lake; clustered or collinear points cannot establish its placement.");
  const fit = fitControlPoints(points, "affine");
  if (!Number.isFinite(fit.rmsM) || fit.residualsM.some(error => error > 20)) throw new Error("Alignment points disagree by more than 20 m. Correct their positions; use a flat chart.");
  const iou = ringIou(shore.points.map(([x, y]) => apply(fit.matrix, x, y)), outline);
  if (iou < 0.8) throw new Error("The aligned shoreline overlaps less than 80% with the selected lake. Check the lake and alignment points.");
  const inverse = invert(fit.matrix);
  return { ...fit, iou, outlinePixels: outline.map(([lon, lat]) => apply(inverse, lon, lat)) };
}

/** Endpoint join; never silently joins closed or differently valued contours. */
export function joinReviewContours(a: ReviewContour, b: ReviewContour): ReviewContour {
  if (a.id === b.id || a.closed || b.closed) throw new Error("Choose two different open paths to join.");
  if (a.value !== null && b.value !== null && a.value !== b.value) throw new Error("Joined paths must have the same value.");
  const options = [a.points, [...a.points].reverse()].flatMap(left => [b.points, [...b.points].reverse()].map(right => ({ left, right, distance: Math.hypot(left.at(-1)![0] - right[0]![0], left.at(-1)![1] - right[0]![1]) })));
  const best = options.sort((x, y) => x.distance - y.distance)[0]!;
  return { ...a, points: [...best.left, ...best.right], value: a.value ?? b.value, confirmed: false };
}
