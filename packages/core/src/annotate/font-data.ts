import { nonZeroPolygons } from "../primitives/offset.js";
import { TEXT_FONTS, type Point2D, type Polygon2D, type TextFont } from "../types.js";

export type FontKind = "bitmap" | "single-line" | "outline";

export interface FontCatalogEntry {
  id: TextFont;
  name: string;
  /**
   * bitmap: the built-in table, drawn as strokes.
   * single-line: a stroke font; engraves as vector lines.
   * outline: a typeface; engraves as filled areas.
   */
  kind: FontKind;
  /** Short attribution for the credits; the full licence ships beside the glyph data. */
  credit: string;
}

export const FONT_CATALOG: readonly FontCatalogEntry[] = [
  { id: "technical", name: "Technical", kind: "bitmap", credit: "TopoStack" },
  { id: "rounded", name: "Rounded", kind: "bitmap", credit: "TopoStack" },
  { id: "stencil", name: "Stencil", kind: "bitmap", credit: "TopoStack" },
  { id: "hershey-sans", name: "Hershey Sans", kind: "single-line", credit: "Hershey Fonts by A. V. Hershey; SVG by Evil Mad Scientist" },
  { id: "hershey-serif", name: "Hershey Serif", kind: "single-line", credit: "Hershey Fonts by A. V. Hershey; SVG by Evil Mad Scientist" },
  { id: "hershey-script", name: "Hershey Script", kind: "single-line", credit: "Hershey Fonts by A. V. Hershey; SVG by Evil Mad Scientist" },
  { id: "relief", name: "Relief SingleLine", kind: "single-line", credit: "The Relief SingleLine Project Authors, SIL OFL 1.1" },
  { id: "jost", name: "Jost", kind: "outline", credit: "The Jost Project Authors, SIL OFL 1.1" },
  { id: "oswald", name: "Oswald", kind: "outline", credit: "The Oswald Project Authors, SIL OFL 1.1" },
  { id: "lora", name: "Lora", kind: "outline", credit: "The Lora Project Authors, SIL OFL 1.1" },
  { id: "roboto-slab", name: "Roboto Slab", kind: "outline", credit: "Google, Apache License 2.0" },
];

export function fontEntry(font: TextFont): FontCatalogEntry {
  return FONT_CATALOG.find((entry) => entry.id === font)!;
}

export function isTextFont(value: unknown): value is TextFont {
  return typeof value === "string" && (TEXT_FONTS as readonly string[]).includes(value);
}

export function isBitmapFont(font: TextFont): font is "technical" | "rounded" | "stencil" {
  return fontEntry(font).kind === "bitmap";
}

/**
 * The compact glyph data for one curated typeface, produced by
 * scripts/build/build-font-glyphs.mjs. Coordinates are font units, y up,
 * baseline at 0. Paths hold absolute M/L/Q/C/Z commands with integers.
 * The data for an id never changes once released: exports read it at render
 * time, and the project fingerprint does not cover it.
 */
export interface FontGlyphsV1 {
  version: 1;
  id: TextFont;
  kind: "single-line" | "outline";
  unitsPerEm: number;
  capHeight: number;
  /** Lowest descender, negative. */
  descender: number;
  /** Character to [advance, path]. */
  glyphs: Record<string, [number, string]>;
  /** Two-character pair to an advance adjustment in font units. */
  kerning: Record<string, number>;
}

const PATH_PATTERN = /^(?:[MLQCZ](?:-?\d+(?: -?\d+)*)?)*$/;

/** Validates untrusted JSON as glyph data, so a bad file fails on load rather than mid-render. */
export function decodeFontGlyphs(value: unknown): FontGlyphsV1 {
  const data = value as FontGlyphsV1;
  if (!data || typeof data !== "object" || data.version !== 1) throw new Error("Font data must be version 1.");
  if (!isTextFont(data.id) || isBitmapFont(data.id)) throw new Error("Font data names an unknown font.");
  if (data.kind !== fontEntry(data.id).kind) throw new Error(`Font data for ${data.id} has the wrong kind.`);
  for (const field of ["unitsPerEm", "capHeight"] as const) {
    if (!Number.isFinite(data[field]) || data[field] <= 0) throw new Error(`Font data ${field} must be positive.`);
  }
  if (!Number.isFinite(data.descender) || data.descender > 0) throw new Error("Font data descender must be zero or negative.");
  if (!data.glyphs || typeof data.glyphs !== "object") throw new Error("Font data glyphs are missing.");
  for (const [character, glyph] of Object.entries(data.glyphs)) {
    if (!Array.isArray(glyph) || !Number.isFinite(glyph[0]) || typeof glyph[1] !== "string" || !PATH_PATTERN.test(glyph[1])) throw new Error(`Font data glyph ${character} is invalid.`);
  }
  if (!data.glyphs["?"]) throw new Error("Font data must draw \"?\".");
  if (!data.kerning || typeof data.kerning !== "object" || Object.entries(data.kerning).some(([pair, amount]) => [...pair].length !== 2 || !Number.isFinite(amount))) throw new Error("Font data kerning is invalid.");
  return data;
}

export class FontNotLoadedError extends Error {
  constructor(readonly font: TextFont) {
    super(`The ${fontEntry(font).name} font has not loaded yet.`);
    this.name = "FontNotLoadedError";
  }
}

/** A glyph in font units, y up: open strokes for single-line fonts, filled regions for outline fonts. */
export interface GlyphShape {
  advance: number;
  strokes: Point2D[][];
  fills: Polygon2D[];
}

export interface LoadedFont {
  data: FontGlyphsV1;
  glyph(character: string): GlyphShape;
}

/**
 * Loaded typefaces for this JavaScript realm. The host registers glyph data
 * before it generates or renders text in that font; each realm (page, worker)
 * keeps its own registry. Drawing an unregistered font throws rather than
 * substituting another, which would put the wrong letters in an export.
 */
const registry = new Map<TextFont, LoadedFont>();

export function registerFont(data: FontGlyphsV1): void {
  const cache = new Map<string, GlyphShape>();
  // Curves flatten to about 1/700 em: under 0.01 mm on a 6 mm title.
  const tolerance = data.unitsPerEm / 700;
  registry.set(data.id, {
    data,
    glyph(character) {
      const known = data.glyphs[character] ? character : "?";
      let shape = cache.get(known);
      if (!shape) {
        const [advance, path] = data.glyphs[known]!;
        const { open, closed } = flattenPath(path, tolerance);
        shape = data.kind === "outline"
          ? { advance, strokes: [], fills: nonZeroPolygons(closed) }
          : { advance, strokes: [...open, ...closed], fills: [] };
        cache.set(known, shape);
      }
      return shape;
    },
  });
}

export function isFontLoaded(font: TextFont): boolean {
  return isBitmapFont(font) || registry.has(font);
}

export function loadedFont(font: TextFont): LoadedFont {
  const loaded = registry.get(font);
  if (!loaded) throw new FontNotLoadedError(font);
  return loaded;
}

/** Test support: forget every registered typeface. */
export function clearRegisteredFonts(): void {
  registry.clear();
}

/** Every font a project draws with, so a host can load them before generating. */
export function projectFonts(config: { textStyle: { font: TextFont }; plaque?: { font?: TextFont } }): TextFont[] {
  return [...new Set([config.textStyle.font, config.plaque?.font ?? config.textStyle.font])];
}

/** Characters in `text` that `font` cannot draw; they would engrave as "?". */
export function missingGlyphs(text: string, font: TextFont): string[] {
  const glyphs = registry.get(font)?.data.glyphs;
  if (!glyphs) return [];
  return [...new Set([...text].filter((character) => character !== "\n" && character !== "\r" && !glyphs[character]))];
}

/**
 * Splits compact glyph path data into polylines, flattening curves until no
 * chord strays more than `tolerance` from the curve. Z closes the ring.
 */
export function flattenPath(path: string, tolerance: number): { open: Point2D[][]; closed: Point2D[][] } {
  const open: Point2D[][] = [];
  const closed: Point2D[][] = [];
  let current: Point2D[] = [];
  const finish = (isClosed: boolean) => {
    if (current.length > 1) (isClosed ? closed : open).push(current);
    current = [];
  };
  for (const [, type, numbers] of path.matchAll(/([MLQCZ])([^MLQCZ]*)/g)) {
    const values = numbers!.trim() ? numbers!.trim().split(" ").map(Number) : [];
    const last = current.at(-1) ?? { x: 0, y: 0 };
    if (type === "M") {
      finish(false);
      current = [{ x: values[0]!, y: values[1]! }];
    } else if (type === "L") {
      current.push({ x: values[0]!, y: values[1]! });
    } else if (type === "Q") {
      const control = { x: values[0]!, y: values[1]! };
      const end = { x: values[2]!, y: values[3]! };
      const steps = curveSteps(Math.hypot(control.x - last.x, control.y - last.y) + Math.hypot(end.x - control.x, end.y - control.y), tolerance);
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps; const u = 1 - t;
        current.push({ x: u * u * last.x + 2 * u * t * control.x + t * t * end.x, y: u * u * last.y + 2 * u * t * control.y + t * t * end.y });
      }
    } else if (type === "C") {
      const first = { x: values[0]!, y: values[1]! };
      const second = { x: values[2]!, y: values[3]! };
      const end = { x: values[4]!, y: values[5]! };
      const length = Math.hypot(first.x - last.x, first.y - last.y) + Math.hypot(second.x - first.x, second.y - first.y) + Math.hypot(end.x - second.x, end.y - second.y);
      const steps = curveSteps(length, tolerance);
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps; const u = 1 - t;
        current.push({
          x: u * u * u * last.x + 3 * u * u * t * first.x + 3 * u * t * t * second.x + t * t * t * end.x,
          y: u * u * u * last.y + 3 * u * u * t * first.y + 3 * u * t * t * second.y + t * t * t * end.y,
        });
      }
    } else if (type === "Z" && current.length) {
      const start = current[0]!;
      const end = current.at(-1)!;
      if (start.x !== end.x || start.y !== end.y) current.push({ ...start });
      finish(true);
    }
  }
  finish(false);
  return { open, closed };
}

/** Chord count that keeps a curve of this control-polygon length within `tolerance`. */
function curveSteps(length: number, tolerance: number): number {
  return Math.max(1, Math.min(32, Math.ceil(Math.sqrt(length / (8 * tolerance)) * 2)));
}
