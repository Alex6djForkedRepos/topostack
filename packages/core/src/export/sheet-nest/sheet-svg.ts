import { labelDimensions } from "../../annotate/labels.js";
import { boundsOverlap, ringBounds, type Bounds2D } from "../../primitives/geometry2d.js";
import type { GeometryIRV1, LayerIR, PaintRegionKind, ProjectConfigV1 } from "../../types.js";
import { escapeXml } from "../svg-primitives.js";
import { OPERATIONS, paintTemplateDocument, paintTemplateGroups, panelBodies, type Operation, type PanelBodies } from "../svg.js";
import { placementMatrix, suffixIds, type NestedPart, type NestedSheet } from "./apply.js";

/** Rough extent of a marking, generous for labels, used only to skip markings far from a part. */
function markingBounds(mark: LayerIR["markings"][number]): Bounds2D | undefined {
  const first = mark.points[0];
  if (!first) return undefined;
  if (mark.label) {
    let reach = 50;
    try {
      const { width, height } = labelDimensions(mark.label, mark.textStyle);
      reach = Math.hypot(width, height);
    } catch {
      // A font that is not loaded cannot be measured; the generous default only costs clipping time.
    }
    return { minX: first.x - reach, minY: first.y - reach, maxX: first.x + reach, maxY: first.y + reach };
  }
  return ringBounds(mark.points);
}

const boundsCache = new WeakMap<LayerIR, Array<Bounds2D | undefined>>();
function layerMarkingBounds(layer: LayerIR): Array<Bounds2D | undefined> {
  let bounds = boundsCache.get(layer);
  if (!bounds) boundsCache.set(layer, bounds = layer.markings.map(markingBounds));
  return bounds;
}

/**
 * The IR as one part sees it: its layers keep only the markings near it.
 * Clipping a marking to a part is the expensive step, and without this every
 * part on a sheet would clip every marking of its layers.
 */
function partView(ir: GeometryIRV1, nested: NestedPart): GeometryIRV1 {
  const reach: Bounds2D = { minX: nested.panel.minX, minY: nested.panel.minY, maxX: nested.panel.maxX, maxY: nested.panel.maxY };
  const members = new Set(nested.panel.layerIndexes);
  return {
    ...ir,
    layers: ir.layers.map((layer) => {
      if (!members.has(layer.index)) return layer;
      const bounds = layerMarkingBounds(layer);
      return { ...layer, markings: layer.markings.filter((_, index) => !bounds[index] || boundsOverlap(bounds[index]!, reach)) };
    }),
  };
}

function partGroup(ir: GeometryIRV1, nested: NestedPart, index: number, operation: string, body: string): string {
  if (!body) return "";
  const layerIds = nested.panel.layerIndexes.map((layerIndex) => ir.layers[layerIndex]?.id).filter(Boolean).join(" ");
  return `<g id="part-${index + 1}-${operation.toUpperCase()}" data-part="${escapeXml(nested.part.label)}" data-layers="${escapeXml(layerIds)}" transform="${placementMatrix(nested.placement)}">${suffixIds(body, `--p${index + 1}`)}</g>`;
}

/**
 * A sheet's per-operation bodies: each part's usual panel paths, unchanged,
 * inside a group that rotates and moves it onto the sheet. Kerf offsets do
 * not depend on orientation, so the path data needs no rework.
 */
export function nestedSheetBodies(ir: GeometryIRV1, sheet: NestedSheet): PanelBodies {
  const bodies = sheet.parts.map((nested) => panelBodies(partView(ir, nested), nested.panel));
  const body = (operation: Operation) => sheet.parts.map((nested, index) => partGroup(ir, nested, index, operation, bodies[index]![operation])).join("");
  return Object.fromEntries(OPERATIONS.map((operation) => [operation, body(operation)])) as PanelBodies;
}

/** A paper stencil registered to a stock sheet; undefined when no part on it keeps paper. */
export function nestedPaintTemplateSvg(ir: GeometryIRV1, config: ProjectConfigV1, sheet: NestedSheet, kind: PaintRegionKind): string | undefined {
  const groups = sheet.parts.map((nested, index) => partGroup(ir, nested, index, `paint-${kind}`, paintTemplateGroups(ir, config, nested.panel, kind) ?? "")).join("");
  if (!groups) return undefined;
  const layerIds = sheet.panel.layerIndexes.map((index) => ir.layers[index]?.id).filter(Boolean).join(", ");
  return paintTemplateDocument(ir, sheet.panel, kind, groups, `${ir.projectName} — ${kind} paint template — sheet ${(sheet.panel.sheetIndex ?? 0) + 1} — ${layerIds}`);
}
