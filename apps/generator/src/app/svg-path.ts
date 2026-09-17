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
