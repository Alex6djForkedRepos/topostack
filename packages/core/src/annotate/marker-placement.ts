import polygonClipping, { type MultiPolygon, type Pair } from "polygon-clipping";
import { boundsOverlap, ringBounds, type PreparedPolygons } from "../primitives/geometry2d.js";
import type { Point2D, Polygon2D } from "../types.js";

/** Partition a filled symbol top-down so every point belongs to its exposed sheet. */
export function markerLayerPolygons(footprint: Point2D[], materials: PreparedPolygons[], holes: Point2D[][] = []): Array<{ layerIndex: number; polygon: Polygon2D }> {
  const ring = (points: Point2D[]): Pair[] => points.map(({ x, y }) => [x, y]);
  const bounds = ringBounds(footprint);
  let remaining: MultiPolygon = holes.length
    ? polygonClipping.difference([[ring(footprint)]], ...holes.map((hole): MultiPolygon => [[ring(hole)]]))
    : [[ring(footprint)]];
  const pieces: Array<{ layerIndex: number; polygon: Polygon2D }> = [];
  for (let layerIndex = materials.length - 1; layerIndex >= 0 && remaining.length; layerIndex -= 1) {
    const material = materials[layerIndex]!;
    const nearby: MultiPolygon = material.polygons.flatMap((polygon, index) => boundsOverlap(bounds, material.outerBounds[index]!) ? [[ring(polygon.outer), ...polygon.holes.map(ring)]] : []);
    if (!nearby.length) continue;
    const visible = polygonClipping.intersection(remaining, nearby);
    if (!visible.length) continue;
    for (const [outer, ...holes] of visible) {
      if (outer) pieces.push({ layerIndex, polygon: {
        outer: outer.map(([x, y]) => ({ x, y })),
        holes: holes.map(hole => hole.map(([x, y]) => ({ x, y }))),
      } });
    }
    remaining = polygonClipping.difference(remaining, nearby);
  }
  return pieces;
}
