import { clipPolyline, pointInPolygon, preparePolygons } from "./geometry2d.js";
import type { Point2D, Polygon2D, WaterFillPattern } from "./types.js";

/**
 * Produces explicit fabrication paths rather than SVG pattern fills, which
 * keeps imports predictable in laser software and makes preview/export match.
 */
export function waterPatternStrokes(
  pattern: WaterFillPattern,
  polygons: Polygon2D[],
  widthMm: number,
  heightMm: number,
  strokeWidthMm: number,
): Point2D[][] {
  if (pattern === "none" || !polygons.length) return [];
  const halfWidth = widthMm / 2;
  const halfHeight = heightMm / 2;
  const spacing = Math.max(2.5, strokeWidthMm * 8);

  if (pattern === "dots") {
    const dots: Point2D[][] = [];
    const dotSpacing = spacing * 1.35;
    for (let y = -halfHeight + dotSpacing / 2; y < halfHeight; y += dotSpacing) {
      const row = Math.round((y + halfHeight) / dotSpacing);
      const offset = row % 2 === 0 ? 0 : dotSpacing / 2;
      for (let x = -halfWidth + dotSpacing / 2 + offset; x < halfWidth; x += dotSpacing) {
        if (polygons.some((polygon) => pointInPolygon({ x, y }, polygon))) dots.push([{ x: x - 0.001, y }, { x: x + 0.001, y }]);
      }
    }
    return dots;
  }

  const strokes: Point2D[][] = [];
  const prepared = preparePolygons(polygons);
  for (let y = -halfHeight + spacing / 2; y < halfHeight; y += spacing) {
    if (pattern === "lines") {
      strokes.push(...clipPolyline([{ x: -halfWidth, y }, { x: halfWidth, y }], prepared));
      continue;
    }
    const wavelength = spacing * 2.6;
    const amplitude = Math.min(0.8, spacing * 0.22);
    const step = Math.max(0.75, wavelength / 12);
    const wave: Point2D[] = [];
    for (let x = -halfWidth; x < halfWidth; x += step) wave.push({ x, y: y + Math.sin((x / wavelength) * Math.PI * 2) * amplitude });
    wave.push({ x: halfWidth, y: y + Math.sin((halfWidth / wavelength) * Math.PI * 2) * amplitude });
    strokes.push(...clipPolyline(wave, prepared));
  }
  return strokes;
}
