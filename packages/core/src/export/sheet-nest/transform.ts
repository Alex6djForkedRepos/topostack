import type { Bounds2D } from "../../primitives/geometry2d.js";
import type { Point2D } from "../../types.js";

export interface RigidTransform {
  rotationDeg: number;
  x: number;
  y: number;
}

/** `R(rotationDeg) · p + (x, y)` for every point. */
export function transformPoints(points: Point2D[], transform: RigidTransform): Point2D[] {
  const radians = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return points.map((point) => ({ x: cos * point.x - sin * point.y + transform.x, y: sin * point.x + cos * point.y + transform.y }));
}

/** Bounds of the points after rotating them about the origin. */
export function rotatedBounds(points: Point2D[], rotationDeg: number): Bounds2D {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const x = cos * point.x - sin * point.y;
    const y = sin * point.x + cos * point.y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/** Convex hull, counter-clockwise and closed (Andrew's monotone chain). */
export function convexHull(points: Point2D[]): Point2D[] {
  const sorted = [...points].sort((left, right) => left.x - right.x || left.y - right.y);
  const cross = (o: Point2D, a: Point2D, b: Point2D) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point2D[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Point2D[] = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return hull.length ? [...hull, hull[0]!] : [];
}

const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360;

/**
 * Rotations worth trying when a bounding box stands in for the part: the
 * allowed set as given, or for free rotation the quarter turns plus the
 * angles that align a convex-hull edge with an axis (the minimum-area
 * bounding rectangle is always one of them).
 */
export function candidateOrientations(outline: Point2D[], allowed: number[] | undefined): number[] {
  if (allowed) return allowed;
  const angles = new Set([0, 90, 180, 270]);
  const hull = convexHull(outline);
  const scored: Array<{ angle: number; area: number }> = [];
  for (let index = 0; index + 1 < hull.length; index += 1) {
    const a = hull[index]!;
    const b = hull[index + 1]!;
    const angle = normalizeDegrees(-(Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    const bounds = rotatedBounds(hull, angle);
    scored.push({ angle, area: (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY) });
  }
  // The four best edge alignments cover the minimum-area box and its quarter turns.
  scored.sort((left, right) => left.area - right.area).slice(0, 4).forEach(({ angle }) => {
    for (const quarter of [0, 90, 180, 270]) angles.add(Number(normalizeDegrees(angle + quarter).toFixed(6)));
  });
  return [...angles];
}
