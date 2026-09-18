import polygonClipping, { type Polygon } from "polygon-clipping";
import { mercatorWorldY, normalizeMultiPolygon } from "./geometry2d.js";
import type { GeoBounds, MarkerSymbol, Point2D } from "./types.js";

/** Enough sides that a marker-sized circle reads as round at any preview zoom. */
function circle(center: Point2D, radius: number, steps = 48): Point2D[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = index / steps * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
  });
}

function thickSegment(start: Point2D, end: Point2D, width: number): Point2D[] {
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const offsetX = -(end.y - start.y) / length * width / 2;
  const offsetY = (end.x - start.x) / length * width / 2;
  return [
    { x: start.x + offsetX, y: start.y + offsetY },
    { x: end.x + offsetX, y: end.y + offsetY },
    { x: end.x - offsetX, y: end.y - offsetY },
    { x: start.x - offsetX, y: start.y - offsetY },
    { x: start.x + offsetX, y: start.y + offsetY },
  ];
}

/** Center a symbol around its geographic anchor. Pins sit above the anchor so their tip identifies it. */
export function markerSymbolCenterForAnchor(symbol: MarkerSymbol, anchor: Point2D, size: number): Point2D {
  return symbol === "pin" ? { x: anchor.x, y: anchor.y - size / 2 } : { ...anchor };
}

/** Fabrication-safe line paths for the marker picker, previews, and SVG output. */
export function markerSymbolPaths(symbol: MarkerSymbol, center: Point2D, size: number): Point2D[][] {
  const radius = size / 2;
  if (symbol === "circle") return [circle(center, radius * 0.78)];
  if (symbol === "cross") {
    const extent = radius * 0.72;
    const width = size * 0.16;
    // One outline, not two overlapping bars: each bar used to fill and clear
    // on its own, doubling the fill and the halo where they cross.
    const bars = [
      thickSegment({ x: center.x - extent, y: center.y - extent }, { x: center.x + extent, y: center.y + extent }, width),
      thickSegment({ x: center.x + extent, y: center.y - extent }, { x: center.x - extent, y: center.y + extent }, width),
    ].map((ring): Polygon => [ring.map(({ x, y }) => [x, y])]);
    return [normalizeMultiPolygon(polygonClipping.union(bars[0]!, bars[1]!))[0]!.outer];
  }
  if (symbol === "triangle") return [[
    { x: center.x, y: center.y - radius * 0.88 },
    { x: center.x + radius * 0.82, y: center.y + radius * 0.66 },
    { x: center.x - radius * 0.82, y: center.y + radius * 0.66 },
    { x: center.x, y: center.y - radius * 0.88 },
  ]];
  if (symbol === "star") {
    return [Array.from({ length: 11 }, (_, index) => {
      const point = index % 10;
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const pointRadius = point % 2 === 0 ? radius * 0.92 : radius * 0.4;
      return { x: center.x + Math.cos(angle) * pointRadius, y: center.y + Math.sin(angle) * pointRadius };
    })];
  }
  return pinPaths(center, radius);
}

/**
 * A teardrop: a round head with straight sides tangent to it, meeting in a
 * point on the anchor. The second ring is the eye, which engraved output cuts
 * out of the head as a hole.
 */
function pinPaths(center: Point2D, radius: number): Point2D[][] {
  const head = { x: center.x, y: center.y - radius * 0.3 };
  const headRadius = radius * 0.62;
  const tip = { x: center.x, y: center.y + radius };
  // Tangent points sit either side of the head-to-tip axis, which points down (+y).
  const spread = Math.acos(headRadius / (tip.y - head.y));
  const start = Math.PI / 2 - spread;
  const sweep = 2 * Math.PI - 2 * spread;
  const steps = 40;
  const outline = Array.from({ length: steps + 1 }, (_, index) => {
    const angle = start - sweep * index / steps;
    return { x: head.x + Math.cos(angle) * headRadius, y: head.y + Math.sin(angle) * headRadius };
  });
  return [[tip, ...outline, tip], circle(head, radius * 0.24, 32)];
}

/** Return the longitude equivalent that is closest to the center of an unwrapped map window. */
export function unwrapLongitude(longitude: number, bounds: GeoBounds): number {
  const center = (bounds.west + bounds.east) / 2;
  return longitude + Math.round((center - longitude) / 360) * 360;
}

/** Test a canonical longitude against bounds that may cross the antimeridian. */
export function longitudeInBounds(longitude: number, bounds: GeoBounds): boolean {
  const unwrapped = unwrapLongitude(longitude, bounds);
  return unwrapped >= bounds.west && unwrapped <= bounds.east;
}

/** Project a geographic coordinate into the artwork's centered millimeter space. */
export function geoPointToMapPoint(lat: number, lon: number, bounds: GeoBounds, widthMm: number, heightMm: number): Point2D {
  const northY = mercatorWorldY(bounds.north);
  const southY = mercatorWorldY(bounds.south);
  const unwrappedLongitude = unwrapLongitude(lon, bounds);
  return {
    x: ((unwrappedLongitude - bounds.west) / (bounds.east - bounds.west) - 0.5) * widthMm,
    y: ((mercatorWorldY(lat) - northY) / (southY - northY) - 0.5) * heightMm,
  };
}
