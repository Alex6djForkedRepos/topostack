import type { MultiPolygon, Pair, Ring } from "polygon-clipping";
import type { Point2D, Polygon2D } from "../types.js";

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Web Mercator world Y in [0, 1] (north at 0), clamped to the projection's latitude limit. */
export function mercatorWorldY(latitude: number): number {
  const radians = clamp(latitude, -85.0511, 85.0511) * Math.PI / 180;
  return (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
}

export interface Bounds2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function close(points: Point2D[]): Point2D[] {
  if (points.length === 0) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || (first.x === last.x && first.y === last.y)) return points;
  return [...points, first];
}

export function toRing(points: Point2D[]): Ring {
  return points.map(({ x, y }) => [x, y] as Pair);
}

export function toPoint(ringPoint: Pair): Point2D {
  return { x: ringPoint[0], y: ringPoint[1] };
}

/**
 * polygon-clipping output as engine polygons: every ring explicitly closed,
 * `outer` wound positively, `holes` negatively.
 *
 * This is the only place that establishes the `Polygon2D` invariant, so every
 * caller of a boolean op must come through here. `refine` may reshape a ring
 * (simplification) or drop it by returning undefined; the default keeps rings
 * verbatim, which is what a caller dividing already-final geometry wants -
 * re-simplifying flattens rounded corners, and dropping a ring deletes
 * material rather than tidying it.
 */
export function normalizeMultiPolygon(
  result: MultiPolygon,
  refine: (ring: Point2D[], role: "outer" | "hole") => Point2D[] | undefined = (ring) => ring,
): Polygon2D[] {
  const polygons: Polygon2D[] = [];
  for (const polygon of result) {
    const [outerRing, ...holeRings] = polygon;
    if (!outerRing) continue;
    const refinedOuter = refine(close(outerRing.map(toPoint)), "outer");
    if (!refinedOuter) continue;
    const outer = signedArea(refinedOuter) < 0 ? [...refinedOuter].reverse() : refinedOuter;
    const holes = holeRings
      .map((ring) => refine(close(ring.map(toPoint)), "hole"))
      .filter((ring): ring is Point2D[] => Boolean(ring))
      .map((ring) => (signedArea(ring) > 0 ? [...ring].reverse() : ring));
    polygons.push({ outer, holes });
  }
  return polygons;
}

export function signedArea(points: Point2D[]): number {
  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    if (current && next) area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

export function ringBounds(ring: Point2D[]): Bounds2D {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of ring) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsOverlap(a: Bounds2D, b: Bounds2D): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function boundsContainBounds(outer: Bounds2D, inner: Bounds2D): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

export function pointInBounds(point: Point2D, bounds: Bounds2D): boolean {
  return point.x >= bounds.minX && point.x <= bounds.maxX && point.y >= bounds.minY && point.y <= bounds.maxY;
}

export function pointInRing(point: Point2D, ring: Point2D[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index];
    const b = ring[previous];
    if (!a || !b) continue;
    const crosses = (a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: Point2D, polygon: Polygon2D): boolean {
  return pointInRing(point, polygon.outer) && !polygon.holes.some((hole) => pointInRing(point, hole));
}

/**
 * Slack on bounding-box rejections. Ray casting can place a crossing a few ulps
 * beyond a ring's true extent, so a box test that must agree exactly with
 * `pointInRing` rejects only points clearly outside.
 */
const BOUNDS_SLACK = 1e-6;

function pointNearBounds(point: Point2D, bounds: Bounds2D): boolean {
  return point.x >= bounds.minX - BOUNDS_SLACK && point.x <= bounds.maxX + BOUNDS_SLACK &&
    point.y >= bounds.minY - BOUNDS_SLACK && point.y <= bounds.maxY + BOUNDS_SLACK;
}

/** Polygons with their ring bounding boxes, built once for repeated clipping and containment tests. */
export interface PreparedPolygons {
  polygons: Polygon2D[];
  outerBounds: Bounds2D[];
  rings: Array<{ ring: Point2D[]; bounds: Bounds2D }>;
  /** Union of every outer ring's bounds; empty (inverted) when there are no polygons. */
  bounds: Bounds2D;
}

export function preparePolygons(polygons: Polygon2D[]): PreparedPolygons {
  const outerBounds = polygons.map((polygon) => ringBounds(polygon.outer));
  const rings = polygons.flatMap((polygon, index) => [
    { ring: polygon.outer, bounds: outerBounds[index]! },
    ...polygon.holes.map((hole) => ({ ring: hole, bounds: ringBounds(hole) })),
  ]);
  const bounds = outerBounds.reduce((union, box) => ({
    minX: Math.min(union.minX, box.minX),
    minY: Math.min(union.minY, box.minY),
    maxX: Math.max(union.maxX, box.maxX),
    maxY: Math.max(union.maxY, box.maxY),
  }), { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY });
  return { polygons, outerBounds, rings, bounds };
}

/** `polygons.some((polygon) => pointInPolygon(point, polygon))`, skipping polygons whose box excludes the point. */
export function pointInPreparedPolygons(point: Point2D, prepared: PreparedPolygons): boolean {
  return prepared.polygons.some((polygon, index) => pointNearBounds(point, prepared.outerBounds[index]!) && pointInPolygon(point, polygon));
}

const NO_POLYGONS = preparePolygons([]);

function asPrepared(polygons: Polygon2D[] | PreparedPolygons): PreparedPolygons {
  return Array.isArray(polygons) ? polygons.length ? preparePolygons(polygons) : NO_POLYGONS : polygons;
}

/**
 * Split a polyline at every ring crossing and keep the pieces inside
 * `polygons` but outside `excludedPolygons`. Pass `preparePolygons` results
 * when clipping many lines against the same material.
 */
export function clipPolyline(points: Point2D[], polygons: Polygon2D[] | PreparedPolygons, excludedPolygons: Polygon2D[] | PreparedPolygons = []): Point2D[][] {
  if (points.length < 2) return [];
  const included = asPrepared(polygons);
  if (!included.polygons.length) return [];
  const pathBounds = ringBounds(points);
  const reach = { minX: pathBounds.minX - BOUNDS_SLACK, minY: pathBounds.minY - BOUNDS_SLACK, maxX: pathBounds.maxX + BOUNDS_SLACK, maxY: pathBounds.maxY + BOUNDS_SLACK };
  // No piece of a line wholly outside the material's box can be inside it.
  if (!boundsOverlap(reach, included.bounds)) return [];
  // Likewise an exclusion set whose box misses the line can neither cut nor contain it.
  const excludedSet = asPrepared(excludedPolygons);
  const excluded = boundsOverlap(reach, excludedSet.bounds) ? excludedSet : NO_POLYGONS;
  const result: Point2D[][] = [];
  let active: Point2D[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (!a || !b) continue;
    const segmentBounds: Bounds2D = {
      minX: Math.min(a.x, b.x) - 1e-6,
      minY: Math.min(a.y, b.y) - 1e-6,
      maxX: Math.max(a.x, b.x) + 1e-6,
      maxY: Math.max(a.y, b.y) + 1e-6,
    };
    const cuts = [0, 1];
    for (let set = 0; set < 2; set += 1) {
      for (const { ring, bounds } of set === 0 ? included.rings : excluded.rings) {
        if (!boundsOverlap(segmentBounds, bounds)) continue;
        for (let edge = 0; edge < ring.length - 1; edge += 1) {
          const t = ring[edge] && ring[edge + 1] ? segmentIntersectionT(a, b, ring[edge]!, ring[edge + 1]!) : undefined;
          if (t !== undefined) cuts.push(t);
        }
      }
    }
    cuts.sort((left, right) => left - right);
    const unique = cuts.filter((value, cutIndex) => cutIndex === 0 || Math.abs(value - cuts[cutIndex - 1]!) > 1e-7);
    for (let cutIndex = 0; cutIndex < unique.length - 1; cutIndex += 1) {
      const startT = unique[cutIndex]!;
      const endT = unique[cutIndex + 1]!;
      const midpoint = pointAt(a, b, (startT + endT) / 2);
      if (pointInPreparedPolygons(midpoint, included) && !pointInPreparedPolygons(midpoint, excluded)) {
        const start = pointAt(a, b, startT);
        const end = pointAt(a, b, endT);
        const previous = active[active.length - 1];
        if (!previous || Math.hypot(previous.x - start.x, previous.y - start.y) > 1e-6) {
          if (active.length > 1) result.push(active);
          active = [start];
        }
        active.push(end);
      } else if (active.length > 1) {
        result.push(active);
        active = [];
      }
    }
  }
  if (active.length > 1) result.push(active);
  return result;
}

export function distanceToSegment(point: Point2D, start: Point2D, end: Point2D): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

export function orientation(a: Point2D, b: Point2D, c: Point2D): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(point: Point2D, a: Point2D, b: Point2D): boolean {
  return Math.abs(orientation(a, b, point)) < 1e-8 &&
    point.x >= Math.min(a.x, b.x) - 1e-8 && point.x <= Math.max(a.x, b.x) + 1e-8 &&
    point.y >= Math.min(a.y, b.y) - 1e-8 && point.y <= Math.max(a.y, b.y) + 1e-8;
}

export function segmentsIntersect(a: Point2D, b: Point2D, c: Point2D, d: Point2D): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (((abC > 0 && abD < 0) || (abC < 0 && abD > 0)) && ((cdA > 0 && cdB < 0) || (cdA < 0 && cdB > 0))) return true;
  return (Math.abs(abC) < 1e-8 && pointOnSegment(c, a, b)) ||
    (Math.abs(abD) < 1e-8 && pointOnSegment(d, a, b)) ||
    (Math.abs(cdA) < 1e-8 && pointOnSegment(a, c, d)) ||
    (Math.abs(cdB) < 1e-8 && pointOnSegment(b, c, d));
}

export function segmentIntersectionT(a: Point2D, b: Point2D, c: Point2D, d: Point2D): number | undefined {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const sx = d.x - c.x;
  const sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return undefined;
  const qx = c.x - a.x;
  const qy = c.y - a.y;
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  return t > 1e-8 && t < 1 - 1e-8 && u >= 0 && u <= 1 ? t : undefined;
}

export function pointAt(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function rotatedPoint(point: Point2D, origin: Point2D, angleRad: number): Point2D {
  if (angleRad === 0) return point;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const cosine = Math.cos(angleRad);
  const sine = Math.sin(angleRad);
  return { x: origin.x + dx * cosine - dy * sine, y: origin.y + dx * sine + dy * cosine };
}

export function ringFitsInsidePolygon(ring: Point2D[], polygon: Polygon2D, marginMm: number, allowContainedHoles = false): boolean {
  const points = ring.slice(0, -1);
  if (!points.length || !points.every((point) => pointInPolygon(point, polygon))) return false;
  // Only container edges near the ring can intersect it or come within the
  // margin; farther edges are separated by more than that on some axis.
  const reach = Math.max(0, marginMm) + BOUNDS_SLACK;
  const ringBox = ringBounds(ring);
  const near = (bounds: Bounds2D, start: Point2D, end: Point2D) =>
    Math.min(start.x, end.x) <= bounds.maxX + reach && Math.max(start.x, end.x) >= bounds.minX - reach &&
    Math.min(start.y, end.y) <= bounds.maxY + reach && Math.max(start.y, end.y) >= bounds.minY - reach;
  const nearbyEdges: Array<[Point2D, Point2D]> = [];
  for (const boundary of [polygon.outer, ...polygon.holes]) {
    for (let edge = 0; edge < boundary.length - 1; edge += 1) {
      const boundaryStart = boundary[edge];
      const boundaryEnd = boundary[edge + 1];
      if (boundaryStart && boundaryEnd && near(ringBox, boundaryStart, boundaryEnd)) nearbyEdges.push([boundaryStart, boundaryEnd]);
    }
  }
  const threshold = marginMm - 1e-7;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const start = ring[index];
    const end = ring[index + 1];
    if (!start || !end || !pointInPolygon(pointAt(start, end, 0.5), polygon)) return false;
    const edgeBox = { minX: Math.min(start.x, end.x), minY: Math.min(start.y, end.y), maxX: Math.max(start.x, end.x), maxY: Math.max(start.y, end.y) };
    for (const [boundaryStart, boundaryEnd] of nearbyEdges) {
      if (!near(edgeBox, boundaryStart, boundaryEnd)) continue;
      if (segmentsIntersect(start, end, boundaryStart, boundaryEnd)) return false;
      // Distances are never negative, so a non-positive margin cannot be violated.
      if (threshold > 0 && Math.min(distanceToSegment(start, boundaryStart, boundaryEnd), distanceToSegment(end, boundaryStart, boundaryEnd), distanceToSegment(boundaryStart, start, end), distanceToSegment(boundaryEnd, start, end)) < threshold) return false;
    }
  }
  return allowContainedHoles || !polygon.holes.some((hole) => hole.slice(0, -1).some((point) => pointInRing(point, ring)));
}
