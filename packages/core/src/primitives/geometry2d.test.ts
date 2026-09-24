import { describe, expect, it } from "vitest";
import { clipPolyline, close, pointAt, pointInPolygon, pointInPreparedPolygons, preparePolygons, segmentIntersectionT } from "./geometry2d.js";
import type { Point2D, Polygon2D } from "../types.js";

function ring(count: number, radius: number, offset = 0): Point2D[] {
  return close(Array.from({ length: count }, (_, i) => {
    const angle = i * 2 * Math.PI / count;
    const r = radius * (1 + 0.2 * Math.sin(7 * angle));
    return { x: offset + r * Math.cos(angle), y: r * Math.sin(angle) };
  }));
}

// Exhaustive edge enumeration is deliberately independent of the spatial index.
function referenceSegments(a: Point2D, b: Point2D, included: Polygon2D[], excluded: Polygon2D[]): Point2D[][] {
  const cuts = [0, 1];
  for (const polygon of [...included, ...excluded]) for (const boundary of [polygon.outer, ...polygon.holes]) {
    for (let i = 0; i < boundary.length - 1; i++) {
      const t = segmentIntersectionT(a, b, boundary[i]!, boundary[i + 1]!);
      if (t !== undefined) cuts.push(t);
    }
  }
  cuts.sort((a, b) => a - b);
  const unique = cuts.filter((value, i) => i === 0 || Math.abs(value - cuts[i - 1]!) > 1e-7);
  return unique.slice(1).flatMap((end, i) => {
    const start = unique[i]!, midpoint = pointAt(a, b, (start + end) / 2);
    return included.some(p => pointInPolygon(midpoint, p)) && !excluded.some(p => pointInPolygon(midpoint, p))
      ? [[pointAt(a, b, start), pointAt(a, b, end)]] : [];
  });
}

describe("indexed polygon boundaries", () => {
  const polygons = [{ outer: ring(512, 100), holes: [ring(129, 25)] }, { outer: ring(100, 20, 130), holes: [] }];
  it("matches exhaustive containment at vertices, near boundaries, and through holes", () => {
    const prepared = preparePolygons(polygons);
    const points = polygons.flatMap(p => [p.outer, ...p.holes].flatMap(r => r.flatMap(p => [p, { x: p.x + 1e-8, y: p.y }, { x: p.x - 1e-8, y: p.y }])));
    for (let y = -130; y <= 130; y += 7) for (let x = -130; x <= 170; x += 7) points.push({ x, y });
    for (const point of points) expect(pointInPreparedPolygons(point, prepared)).toBe(polygons.some(p => pointInPolygon(point, p)));
  });

  it("clips crossing and tangent paths exactly like exhaustive edge scans", () => {
    const excluded = [{ outer: ring(200, 40, 45), holes: [ring(80, 10, 45)] }];
    const includedSet = preparePolygons(polygons), excludedSet = preparePolygons(excluded);
    for (let i = 0; i < 150; i++) {
      const a = { x: -160, y: -140 + i * 2 }, b = { x: 170, y: 120 - i * 1.7 };
      const actual = clipPolyline([a, b], includedSet, excludedSet).flatMap(path => path.slice(1).map((p, i) => [path[i]!, p]));
      expect(actual).toEqual(referenceSegments(a, b, polygons, excluded));
    }
    for (const boundary of [polygons[0]!.outer, polygons[0]!.holes[0]!]) {
      const a = boundary[0]!, b = boundary[1]!;
      const actual = clipPolyline([a, b], includedSet, excludedSet).flatMap(path => path.slice(1).map((p, i) => [path[i]!, p]));
      expect(actual).toEqual(referenceSegments(a, b, polygons, excluded));
    }
  });

  it("supports implicit ring closure for point queries and fresh preparation after edits", () => {
    const polygon = { outer: ring(100, 30).slice(0, -1), holes: [] };
    const prepared = preparePolygons([polygon]);
    expect(pointInPreparedPolygons({ x: 0, y: 0 }, prepared)).toBe(true);
    for (const p of polygon.outer) p.x += 100;
    const moved = preparePolygons([polygon]);
    expect(pointInPreparedPolygons({ x: 0, y: 0 }, moved)).toBe(false);
    expect(pointInPreparedPolygons({ x: 100, y: 0 }, moved)).toBe(true);
  });
});

describe("connected-ring containment", () => {
  it("matches exhaustive vertex, midpoint, crossing, and clearance checks", async () => {
    const { ringFitsInsidePolygon, segmentsIntersect, distanceToSegment, pointInRing } = await import("./geometry2d.js");
    const polygon = { outer: ring(96, 100), holes: [ring(65, 12, 20)] };
    const reference = (child: Point2D[], margin: number, allowHoles: boolean): boolean => {
      if (!child.slice(0, -1).every(p => pointInPolygon(p, polygon))) return false;
      for (let i = 0; i < child.length - 1; i++) {
        const a = child[i]!, b = child[i + 1]!;
        if (!pointInPolygon(pointAt(a, b, 0.5), polygon)) return false;
        for (const boundary of [polygon.outer, ...polygon.holes]) for (let j = 0; j < boundary.length - 1; j++) {
          const c = boundary[j]!, d = boundary[j + 1]!;
          if (segmentsIntersect(a, b, c, d)) return false;
          if (Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b)) < margin - 1e-7) return false;
        }
      }
      return allowHoles || !polygon.holes.some(hole => hole.slice(0, -1).some(p => pointInRing(p, child)));
    };
    const prepared = preparePolygons([polygon]);
    for (const radius of [5, 30, 65, 90]) for (const x of [-70, -20, 0, 20, 70]) for (const margin of [0, 2, 10]) for (const allowHoles of [false, true]) {
      const child = ring(24, radius, x);
      expect(ringFitsInsidePolygon(child, polygon, margin, allowHoles, prepared)).toBe(reference(child, margin, allowHoles));
    }
  });
});
