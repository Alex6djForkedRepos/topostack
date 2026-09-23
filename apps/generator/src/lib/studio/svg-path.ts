import { labelSvgPaths, roundText, type OperationPath, type Polygon2D } from "@topostack/core";

/**
 * One polyline as an SVG path. Every preview, the sidebar's marker symbols and
 * the map overlay walked points into `M`/`L` with their own private copy of
 * this line; they are all the same walk, and a change to it (rounding, a
 * closing `Z`) has to apply everywhere at once or the previews disagree with
 * the exported artwork.
 */
export function pointsToPath(points: readonly { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
}

/**
 * A marker symbol's rings as one even-odd path, so a pin's eye reads as a
 * hole in its head the way it is engraved, instead of being filled over.
 */
export function symbolPath(rings: readonly (readonly { x: number; y: number }[])[]): string {
  return rings.map((ring) => `${pointsToPath(ring)} Z`).join(" ");
}

/** Filled polygons, holes included, as one even-odd path. */
export function polygonsPath(polygons: readonly Polygon2D[]): string {
  return polygons.flatMap(({ outer, holes }) => [outer, ...holes]).map((ring) => `${pointsToPath(ring)} Z`).join(" ");
}

/** Filled pieces retain their interior voids in both SVG previews. */
export function markingPath(marking: OperationPath): string {
  if (!marking.filled) return pointsToPath(marking.points);
  return [marking.points, ...(marking.holes ?? [])].map(ring => `${pointsToPath(ring)} Z`).join(" ");
}

/**
 * A text marking as the previews draw it, from the same geometry the export
 * writes: `fill` for typeface letters (even-odd), otherwise `stroke`, with
 * round pen ends for the rounded style and single-line fonts.
 */
export function labelPaths(marking: OperationPath): { stroke: string; fill: string; round: boolean } {
  if (!marking.label || !marking.points[0]) return { stroke: "", fill: "", round: false };
  return { ...labelSvgPaths(marking.label, marking.points[0], 0, 0, marking.labelRotationRad, marking.textStyle), round: roundText(marking.textStyle) };
}
