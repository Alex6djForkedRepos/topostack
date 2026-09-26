import type { GeometryIRV1, Point2D, Polygon2D } from "@topostack/core";

/**
 * Draws generated geometry as a small SVG for the in-chat preview: a layered
 * model as a stack of sheets seen from above and in front, a flat engraving as
 * its contour lines. The output holds numbers and fixed colors only, never text
 * from the project, so it can be inserted as markup.
 */
export interface RenderOptions {
  /** Pixel width of the drawing; the height follows the model. */
  width?: number;
}

/** Vertical squash of the sheets' top faces, as seen from about 35° above. */
const TILT = 0.58;
/** Hypsometric stops from the lowest sheet to the highest. */
const RAMP: Array<[number, [number, number, number]]> = [
  [0, [96, 128, 88]],
  [0.35, [148, 160, 104]],
  [0.65, [184, 158, 116]],
  [0.85, [168, 150, 138]],
  [1, [236, 234, 228]],
];

export function rampColor(fraction: number): string {
  const t = Math.max(0, Math.min(1, fraction));
  const upper = RAMP.findIndex(([stop]) => stop >= t);
  const [stopB, colorB] = RAMP[Math.max(1, upper)]!;
  const [stopA, colorA] = RAMP[Math.max(0, upper - 1)]!;
  const mix = stopB === stopA ? 0 : (t - stopA) / (stopB - stopA);
  const [r, g, b] = colorA.map((channel, index) => Math.round(channel + (colorB[index]! - channel) * mix)) as [number, number, number];
  return `rgb(${r} ${g} ${b})`;
}

const shade = (color: string, factor: number) => color.replace(/\d+/g, (channel) => String(Math.round(Number(channel) * factor)));

function ringPath(ring: Point2D[], project: (point: Point2D) => [number, number]): string {
  if (ring.length < 3) return "";
  return ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join("") + "Z";
}

function polygonsPath(polygons: Polygon2D[], project: (point: Point2D) => [number, number]): string {
  return polygons.map((polygon) => [polygon.outer, ...polygon.holes].map((ring) => ringPath(ring, project)).join("")).join("");
}

/** A layered model as stacked sheets: each sheet's edge, then its top face, from the bottom up. */
export function renderStack(ir: Pick<GeometryIRV1, "widthMm" | "heightMm" | "layers">, options: RenderOptions = {}): string {
  const width = options.width ?? 640;
  const margin = 12;
  const scale = (width - margin * 2) / ir.widthMm;
  const layers = [...ir.layers].sort((a, b) => a.index - b.index);
  const thicknessPx = (layers[0]?.materialThicknessMm ?? 3) * scale;
  // Track what is drawn so the picture is cropped to the stack, not to its tallest possible extent.
  let top = Infinity, bottom = -Infinity;
  const paths = layers.map((layer, order) => {
    const lift = order * thicknessPx;
    const project = (point: Point2D): [number, number] => {
      const y = point.y * scale * TILT - lift;
      top = Math.min(top, y); bottom = Math.max(bottom, y + thicknessPx);
      return [width / 2 + point.x * scale, y];
    };
    const face = polygonsPath(layer.polygons, project);
    if (!face) return "";
    const color = rampColor(layers.length > 1 ? order / (layers.length - 1) : 1);
    // The edge is the face moved down by one sheet; drawing it first leaves a visible band.
    const edge = polygonsPath(layer.polygons, (point) => { const [x, y] = project(point); return [x, y + thicknessPx]; });
    return `<path d="${edge}" fill="${shade(color, 0.62)}" fill-rule="evenodd"/><path d="${face}" fill="${color}" fill-rule="evenodd" stroke="${shade(color, 0.45)}" stroke-width="0.6"/>`;
  }).join("");
  if (!Number.isFinite(top)) { top = 0; bottom = 0; }
  const viewTop = Math.floor(top - margin);
  const height = Math.ceil(bottom + margin) - viewTop;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${viewTop} ${width} ${height}" width="100%" role="img" aria-label="Preview of ${layers.length} stacked sheets">${paths}</svg>`;
}

/** A flat engraving as its contour lines seen from above; every fifth line is heavier, as index contours are. */
export function renderContours(ir: Pick<GeometryIRV1, "widthMm" | "heightMm" | "layers">, options: RenderOptions & { indexInterval?: number } = {}): string {
  const width = options.width ?? 640;
  const margin = 12;
  const scale = (width - margin * 2) / ir.widthMm;
  const height = Math.ceil(ir.heightMm * scale + margin * 2);
  const project = (point: Point2D): [number, number] => [width / 2 + point.x * scale, height / 2 + point.y * scale];
  const interval = options.indexInterval ?? 5;
  const layers = [...ir.layers].sort((a, b) => a.index - b.index);
  const lines = layers.map((layer, order) => {
    const d = polygonsPath(layer.polygons, project);
    if (!d) return "";
    const index = order > 0 && order % interval === 0;
    return `<path d="${d}" fill="none" stroke="currentColor" stroke-opacity="${index ? 0.95 : 0.6}" stroke-width="${index ? 1.3 : 0.6}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Preview of ${layers.length} engraved contour lines">${lines}</svg>`;
}
