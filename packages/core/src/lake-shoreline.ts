import polygonClipping, { type Pair } from "polygon-clipping";
import { close, distanceToSegment, signedArea } from "./geometry2d.js";
import type { Point2D, Polygon2D, ProjectConfigV1, SourceBundleV1 } from "./types.js";

/** Round sparse shore samples without extrapolating beyond their local edges. */
export function smoothLakePolygon(polygon: Polygon2D, minimumFeatureMm: number): Polygon2D {
  const smooth = (ring: Point2D[]): Point2D[] => {
    const points = close(ring).slice(0, -1).filter((p, i, all) => {
      const previous = all[(i + all.length - 1) % all.length]!;
      return Math.hypot(p.x - previous.x, p.y - previous.y) > 1e-7;
    });
    if (points.length < 3) return ring;
    // Remove sub-feature slivers: a near reversal can be long enough to survive
    // ordinary simplification while its width is too small to fabricate.
    for (let i = points.length - 1; i >= 0 && points.length > 3; i -= 1) {
      const p = points[i]!, a = points[(i + points.length - 1) % points.length]!, b = points[(i + 1) % points.length]!;
      const ax = p.x - a.x, ay = p.y - a.y, bx = b.x - p.x, by = b.y - p.y;
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const width = Math.abs(ax * by - ay * bx) / Math.max(la, lb);
      if (ax * bx + ay * by < -0.8 * la * lb && width < minimumFeatureMm * 0.18 &&
        distanceToSegment(p, a, b) <= Math.min(2, minimumFeatureMm * 2)) points.splice(i, 1);
    }
    const result: Point2D[] = [];
    points.forEach((p, i) => {
      const a = points[(i + points.length - 1) % points.length]!;
      const b = points[(i + 1) % points.length]!;
      const incoming = Math.hypot(p.x - a.x, p.y - a.y);
      const outgoing = Math.hypot(b.x - p.x, b.y - p.y);
      // Local spacing, rather than terrain resolution, controls sparse shores.
      // A physical cap bounds displacement even when an outline is very coarse.
      const trim = Math.min(Math.min(incoming, outgoing) * 0.25, Math.max(0.25, minimumFeatureMm), 2);
      const start = { x: p.x + (a.x - p.x) * trim / incoming, y: p.y + (a.y - p.y) * trim / incoming };
      const end = { x: p.x + (b.x - p.x) * trim / outgoing, y: p.y + (b.y - p.y) * trim / outgoing };
      for (let step = 0; step <= 4; step += 1) {
        const t = step / 4, u = 1 - t;
        result.push({ x: u * u * start.x + 2 * u * t * p.x + t * t * end.x,
          y: u * u * start.y + 2 * u * t * p.y + t * t * end.y });
      }
    });
    return close(result);
  };
  const candidate = { outer: smooth(polygon.outer), holes: polygon.holes.map(smooth) };
  const rings = [candidate.outer, ...candidate.holes];
  // Reject changes that collapse/split a lake or merge an island into its bank.
  // Comparing signed ring area with the normalized union also catches crossings.
  const normalized = polygonClipping.union([rings.map(r => r.map(p => [p.x, p.y] as Pair))]);
  if (normalized.length !== 1 || normalized[0]!.length !== rings.length) return polygon;
  const areas = rings.map(ring => Math.abs(signedArea(ring))).sort((a, b) => a - b);
  const normalizedAreas = normalized[0]!.map(ring => Math.abs(signedArea(ring.map(([x, y]) => ({ x, y }))))).sort((a, b) => a - b);
  if (areas.some((area, i) => Math.abs(normalizedAreas[i]! - area) > Math.max(1e-7, area * 1e-7))) return polygon;
  const originals = [polygon.outer, ...polygon.holes];
  if (rings.some((ring, i) => {
    const originalArea = Math.abs(signedArea(close(originals[i]!)));
    return Math.abs(Math.abs(signedArea(ring)) - originalArea) > originalArea * 0.05;
  })) return polygon;
  return candidate;
}

/** Work on a copy at generation time so repeated previews never accumulate smoothing. */
export function smoothLakeShorelines(source: SourceBundleV1, config: ProjectConfigV1): SourceBundleV1 {
  if (!config.smoothing) return source;
  const polygons = new Map<string, Polygon2D>();
  const rings = new Map<string, Point2D[]>();
  const key = (value: unknown) => JSON.stringify(value);
  const register = (polygon: Polygon2D) => {
    const id = key(polygon);
    if (polygons.has(id)) return;
    const smoothed = smoothLakePolygon(polygon, config.minimumFeatureMm);
    polygons.set(id, smoothed);
    [polygon.outer, ...polygon.holes].forEach((ring, i) => rings.set(key(ring), [smoothed.outer, ...smoothed.holes][i]!));
  };
  source.waterAreas?.filter(area => area.kind === "lake").forEach(area => register(area.polygon));
  source.inlandWaterAreas?.forEach(register);
  if (!polygons.size) return source;
  return {
    ...source,
    waterAreas: source.waterAreas?.map(area => area.kind === "lake" ? { ...area, polygon: polygons.get(key(area.polygon))! } : area),
    waterPatternAreas: source.waterPatternAreas?.map(polygon => polygons.get(key(polygon)) ?? polygon),
    markings: source.markings.map(marking => marking.kind === "water" && rings.has(key(marking.points))
      ? { ...marking, points: rings.get(key(marking.points))! } : marking),
  };
}
