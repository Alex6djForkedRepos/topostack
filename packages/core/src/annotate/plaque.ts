import { ANCHOR_VECTORS, anchoredCenter } from "./anchor.js";
import { isBitmapFont } from "./font-data.js";
import { labelDimensions } from "./labels.js";
import { PLAQUE_MAX_LINES, type OperationPath, type PlaqueV1, type Point2D, type ProjectConfigV1, type TextFont, type TextStyleV1 } from "../types.js";

/** Space between plaque lines as a fraction of the cap height. */
const LINE_GAP = 0.6;
/** Material kept clear around the text block, as a fraction of the cap height. */
const FOOTPRINT_PADDING = 0.5;

/**
 * The lines a plaque engraves: trimmed, non-empty, at most PLAQUE_MAX_LINES.
 * The built-in fonts have capitals only, so their titles are capitalized;
 * typefaces keep the case as typed.
 */
export function plaqueLines(text: string, font: TextFont = "technical"): string[] {
  return text.split(/\r?\n/).map((line) => (isBitmapFont(font) ? line.trim().toUpperCase() : line.trim())).filter(Boolean).slice(0, PLAQUE_MAX_LINES);
}

/** The font a title engraves in: its own, or the project's text font. */
export function plaqueFont(config: Pick<ProjectConfigV1, "plaque" | "textStyle">): TextFont {
  return config.plaque?.font ?? config.textStyle.font;
}

/** The plaque to engrave, or undefined when it is off or has no text. */
export function activePlaque(config: Pick<ProjectConfigV1, "plaque">): PlaqueV1 | undefined {
  return config.plaque?.enabled && plaqueLines(config.plaque.text).length > 0 ? config.plaque : undefined;
}

interface PlaqueLayout { lines: string[]; style: TextStyleV1; widths: number[]; width: number; height: number; center: Point2D }

function layout(config: ProjectConfigV1, plaque: PlaqueV1): PlaqueLayout {
  const font = plaqueFont(config);
  const lines = plaqueLines(plaque.text, font);
  const style: TextStyleV1 = { font, sizeMm: plaque.sizeMm };
  const widths = lines.map((line) => labelDimensions(line, style).width);
  const width = Math.max(0, ...widths);
  // The last line's box reaches down to the descenders of a typeface.
  const lastLineHeight = labelDimensions("", style).height;
  const height = (lines.length - 1) * plaque.sizeMm * (1 + LINE_GAP) + lastLineHeight;
  const center = anchoredCenter(config, plaque.placement, width / 2, height / 2, Math.hypot(width, height) / 2);
  return { lines, style, widths, width, height, center };
}

export function plaqueMarkings(config: ProjectConfigV1): OperationPath[] {
  const plaque = activePlaque(config);
  if (!plaque) return [];
  const { lines, style, widths, width, height, center } = layout(config, plaque);
  // Lines align toward the anchored edge, so a corner title reads flush with it.
  const align = ANCHOR_VECTORS[plaque.placement.anchor].x;
  const top = center.y - height / 2;
  return lines.map((line, index) => {
    const lineWidth = widths[index]!;
    const left = align < 0 ? center.x - width / 2 : align > 0 ? center.x + width / 2 - lineWidth : center.x - lineWidth / 2;
    return {
      id: `plaque-line-${index + 1}`,
      operation: "engrave",
      kind: "label",
      points: [{ x: left, y: top + index * plaque.sizeMm * (1 + LINE_GAP) }],
      label: line,
      textStyle: style,
    };
  });
}

/** Reserved material around the plaque text, closed ring. */
export function plaqueFootprint(config: ProjectConfigV1): Point2D[] | undefined {
  const plaque = activePlaque(config);
  if (!plaque) return undefined;
  const { width, height, center } = layout(config, plaque);
  const pad = plaque.sizeMm * FOOTPRINT_PADDING;
  const left = center.x - width / 2 - pad;
  const right = center.x + width / 2 + pad;
  const top = center.y - height / 2 - pad;
  const bottom = center.y + height / 2 + pad;
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }, { x: left, y: top }];
}
