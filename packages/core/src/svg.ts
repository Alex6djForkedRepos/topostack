import { CIRCLE_CROP_SEGMENTS, cropRadiusMm } from "./crop.js";
import { exportBlockReason } from "./export-policy.js";
import { formatNumber as format } from "./format.js";
import { CONTOUR_SIMPLIFICATION_FACTOR, horizontalScaleFor } from "./geometry.js";
import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import { clipPolyline, normalizeMultiPolygon, pointAt, pointInPreparedPolygons, preparePolygons, type PreparedPolygons, ringBounds, toRing } from "./geometry2d.js";
import { labelLineSegments, labelPathData } from "./labels.js";
import { offsetClosedRing } from "./offset.js";
import { displayElevation, displayLength, elevationUnit, lengthUnit } from "./units.js";
import { waterPatternStrokes } from "./water-pattern.js";
import type { ExportFile, FabricationNest, FabricationPackageV1, FabricationPanelV1, GeometryIRV1, LayerIR, LineStyleV1, Point2D, ProjectConfigV1 } from "./types.js";

const CUT = "#FE0002";
const SCORE = "#2366FF";
const ENGRAVE = "#2366FF";
// Keep processing intent on each leaf shape: importers may flatten SVG groups.
const CUT_LINE = `fill="none" stroke="${CUT}"`;
const ENGRAVE_LINE = `fill="none" stroke="${ENGRAVE}"`;
/**
 * Assembly ids get their own colour and group so the machine treats them as a
 * separate process: they are guidance for the person gluing the stack, not
 * part of the artwork, and are hidden by the layer above once assembled.
 */
const ASSEMBLY = "#00A651";
const MAX_EXPORT_PACKAGE_BYTES = 100_000_000;
/** Engraving groups in output order; `engravingCategory` maps each marking to one. */
const ENGRAVING_CATEGORIES = ["major-roads", "local-roads", "trails", "transport-labels", "water", "boundaries", "coordinate-grid", "annotations", "assembly-labels", "general"] as const;
type EngravingCategory = (typeof ENGRAVING_CATEGORIES)[number];
/** Assembly ids ride in their own top-level group, so the artwork categories exclude them. */
const ARTWORK_CATEGORIES = ENGRAVING_CATEGORIES.filter((category) => category !== "assembly-labels");
const ASSEMBLY_CATEGORIES = ["assembly-labels"] as const satisfies readonly EngravingCategory[];

function safeName(name: string): string {
  const value = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return value || "topostack-project";
}

function pathData(points: Point2D[], offsetX = 0, offsetY = 0, closePath = false): string {
  const commands = points.map((point, index) => `${index === 0 ? "M" : "L"}${format(point.x + offsetX)} ${format(point.y + offsetY)}`);
  if (closePath) commands.push("Z");
  return commands.join(" ");
}

function layerCutPaths(layer: LayerIR, laserKerfMm: number, omittedHoles = new Map<number, Set<number>>(), included?: Set<number>): string {
  const compensationMm = laserKerfMm / 2;
  return layer.polygons.flatMap((polygon, polygonIndex) => {
    if (included && !included.has(polygonIndex)) return [];
    const omittedHoleIndexes = omittedHoles.get(polygonIndex) ?? new Set<number>();
    return [
      ...offsetClosedRing(polygon.outer, compensationMm, "miter").map((ring, offsetIndex) => `<path id="${layer.id}-cut-${polygonIndex + 1}-offset-${offsetIndex + 1}" d="${pathData(ring, 0, 0, true)}" ${CUT_LINE}/>`),
      ...polygon.holes.flatMap((hole, holeIndex) => omittedHoleIndexes.has(holeIndex) ? [] : [
        ...offsetClosedRing(hole, -compensationMm, "miter").map((ring, offsetIndex) => `<path id="${layer.id}-cut-${polygonIndex + 1}-hole-${holeIndex + 1}-offset-${offsetIndex + 1}" d="${pathData(ring, 0, 0, true)}" ${CUT_LINE}/>`),
      ]),
    ];
  }).join("");
}

function engravingCategory(mark: LayerIR["markings"][number]): EngravingCategory {
  if (mark.id.startsWith("piece-")) return "assembly-labels";
  if (mark.id.startsWith("transport-label-")) return "transport-labels";
  if (mark.transportationClass === "major-road") return "major-roads";
  if (mark.transportationClass === "local-road") return "local-roads";
  if (mark.transportationClass === "trail") return "trails";
  if (mark.kind === "water") return "water";
  if (mark.kind === "boundary") return "boundaries";
  if (mark.kind === "grid") return "coordinate-grid";
  if (mark.kind === "label" || mark.kind === "guide") return "annotations";
  return "general";
}

function categoryStrokeAttributes(category: EngravingCategory, style: LineStyleV1): string {
  const width = category === "major-roads" ? style.majorRoadMm :
    category === "local-roads" ? style.localRoadMm :
    category === "trails" ? style.trailMm :
    category === "water" ? style.waterMm :
    category === "boundaries" ? style.boundaryMm :
    category === "coordinate-grid" ? style.coordinateGridMm : style.annotationMm;
  if (category === "assembly-labels") return ` stroke-width="${format(width)}"`;
  if (category === "boundaries") return ` stroke-width="${format(width)}" stroke-dasharray="${format(Math.max(width * 8, 1.6))} ${format(Math.max(width * 5, 1))}" stroke-linecap="round"`;
  if (category === "coordinate-grid") return ` stroke-width="${format(width)}" stroke-dasharray="0.01 ${format(Math.max(width * 5, 0.9))}" stroke-linecap="round"`;
  if (category === "major-roads" || category === "local-roads") return ` stroke-width="${format(width)}" stroke-linecap="${style.roadCap}" stroke-linejoin="round"`;
  if (category !== "trails" || style.trailPattern === "solid") return ` stroke-width="${format(width)}"`;
  const dash = style.trailPattern === "dotted"
    ? `0.01 ${format(Math.max(width * 4, 0.7))}`
    : `${format(Math.max(width * 6, 1.2))} ${format(Math.max(width * 4, 0.8))}`;
  return ` stroke-width="${format(width)}" stroke-dasharray="${dash}" stroke-linecap="round"`;
}

/** White preview halos are empty material, never a laser operation. Resolve
 * them into gaps in the actual line geometry before serialization. */
interface MarkerClearance { material: PreparedPolygons; excluded: PreparedPolygons }
function markerClearance(layers: LayerIR[]): MarkerClearance | undefined {
  const halos = layers.flatMap(layer => layer.markings.filter(mark => mark.knockout));
  if (!halos.length) return undefined;
  return {
    material: preparePolygons(layers.flatMap(layer => layer.polygons)),
    excluded: preparePolygons(halos.map(mark => ({ outer: mark.points, holes: mark.holes ?? [] }))),
  };
}

/** All internal line serializers emit absolute M/L coordinates (no curves). */
function clearLineData(data: string, clearance?: MarkerClearance): string {
  if (!clearance) return data;
  return data.split("M").filter(Boolean).flatMap(subpath => {
    const points = [...subpath.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }));
    return clipPolyline(points, clearance.material, clearance.excluded).map(points => pathData(points));
  }).join(" ");
}

function markingPath(mark: LayerIR["markings"][number], clearance?: MarkerClearance, stroke?: string): string {
  if (mark.knockout) return "";
  const color = stroke ?? (mark.operation === "score" ? SCORE : ENGRAVE);
  if (mark.label && mark.points[0]) return `<path id="${escapeXml(mark.id)}" d="${clearLineData(labelPathData(mark.label, mark.points[0], 0, 0, mark.labelRotationRad, mark.textStyle), clearance)}" fill="none" stroke="${color}"${mark.textStyle?.font === "rounded" ? ' stroke-linecap="round" stroke-linejoin="round"' : ""}/>`;
  const paint = mark.filled ? `fill="${color}" stroke="none"` : `fill="none" stroke="${color}"`;
  const data = [pathData(mark.points, 0, 0, mark.filled), ...(mark.holes ?? []).map(hole => pathData(hole, 0, 0, true))].join(" ");
  return mark.points.length > 1 ? `<path id="${escapeXml(mark.id)}" d="${mark.filled ? data : clearLineData(data, clearance)}" ${paint}${mark.holes?.length ? ' fill-rule="evenodd"' : ""}/>` : "";
}

function layerMarkingPaths(layer: LayerIR, operation: "score" | "engrave", style: LineStyleV1, categories: readonly EngravingCategory[] = ARTWORK_CATEGORIES, source: LayerIR["markings"] = layer.markings): string {
  const markings = source.filter((mark) => mark.operation === operation);
  const clearance = markerClearance([layer]);
  return categories.map((category) => {
    const paths = markings.filter((mark) => engravingCategory(mark) === category).map((mark) => markingPath(mark, clearance, category === "assembly-labels" ? ASSEMBLY : undefined)).join("");
    return paths ? `<g id="${layer.id}-${operation.toUpperCase()}-${category}"${categoryStrokeAttributes(category, style)}>${paths}</g>` : "";
  }).join("");
}

function svgDocument(width: number, height: number, body: string, title: string, viewX = -width / 2, viewY = -height / 2): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${format(width)}mm" height="${format(height)}mm" viewBox="${format(viewX)} ${format(viewY)} ${format(width)} ${format(height)}"><title>${escapeXml(title)}</title>${body}</svg>`;
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ?? character);
}

export function layerToSvg(ir: GeometryIRV1, layer: LayerIR): string {
  const width = ir.widthMm + ir.laserKerfMm;
  const height = ir.heightMm + ir.laserKerfMm;
  const assembly = layerMarkingPaths(layer, "engrave", ir.lineStyle, ASSEMBLY_CATEGORIES);
  const body = `<g id="ENGRAVE" data-operation="ENGRAVE" fill="none" stroke="${ENGRAVE}" stroke-width="${format(ir.lineStyle.annotationMm)}"><g id="${layer.id}-ENGRAVE">${layerMarkingPaths(layer, "engrave", ir.lineStyle)}</g></g>${assembly ? `<g id="ASSEMBLY" data-operation="ENGRAVE" fill="none" stroke="${ASSEMBLY}" stroke-width="${format(ir.lineStyle.annotationMm)}"><g id="${layer.id}-ASSEMBLY">${assembly}</g></g>` : ""}<g id="SCORE" data-operation="SCORE" fill="none" stroke="${SCORE}" stroke-width="${format(ir.lineStyle.waterMm)}"><g id="${layer.id}-SCORE">${layerMarkingPaths(layer, "score", ir.lineStyle)}</g></g><g id="CUT" data-operation="CUT" fill="none" stroke="${CUT}" stroke-width="0.1" fill-rule="evenodd"><g id="${layer.id}-CUT">${layerCutPaths(layer, ir.laserKerfMm)}</g></g>`;
  return svgDocument(width, height, body, `${ir.projectName} — ${layer.id}`);
}

interface FabricationPanel extends FabricationPanelV1 {
  /** Polygon indexes to emit per layer index; absent when the project is cut whole. */
  included?: Map<number, Set<number>>;
}

/** A nest family: the root layer plus everything cut out of it, transitively. */
function nestFamilies(ir: GeometryIRV1): Array<{ rootLayerIndex: number; layerIndexes: number[] }> {
  const parentByLayer = new Map(ir.fabricationNests.map((nest) => [nest.nestedLayerIndex, nest.donorLayerIndex]));
  const childrenByLayer = new Map<number, number[]>();
  ir.fabricationNests.forEach((nest) => childrenByLayer.set(nest.donorLayerIndex, [...(childrenByLayer.get(nest.donorLayerIndex) ?? []), nest.nestedLayerIndex]));
  const collect = (layerIndex: number): number[] => [layerIndex, ...(childrenByLayer.get(layerIndex) ?? []).flatMap(collect)];
  return ir.layers.filter((layer) => !parentByLayer.has(layer.index)).map((layer) => ({
    rootLayerIndex: layer.index,
    layerIndexes: collect(layer.index),
  }));
}

/**
 * A nested piece is cut out of its donor, so it ships on the donor's sheet
 * whatever its own layer's seam grid says. Walks each cavity back to the
 * family root and answers with that root polygon's index.
 */
function rootPolygonByPolygon(ir: GeometryIRV1, family: { rootLayerIndex: number; layerIndexes: number[] }): Map<number, Map<number, number>> {
  const roots = new Map<number, Map<number, number>>();
  const root = ir.layers[family.rootLayerIndex];
  roots.set(family.rootLayerIndex, new Map(root?.polygons.map((_, index) => [index, index] as const) ?? []));
  // Donors always precede the layers nested in them, so one ascending pass
  // resolves every chain.
  for (const nest of ir.fabricationNests) {
    if (!family.layerIndexes.includes(nest.nestedLayerIndex)) continue;
    const donorRoots = roots.get(nest.donorLayerIndex);
    const nestedRoots = roots.get(nest.nestedLayerIndex) ?? new Map<number, number>();
    for (const cavity of nest.cavities) {
      const rootIndex = donorRoots?.get(cavity.donorPolygonIndex);
      if (rootIndex !== undefined) nestedRoots.set(cavity.nestedPolygonIndex, rootIndex);
    }
    roots.set(nest.nestedLayerIndex, nestedRoots);
  }
  return roots;
}

function cellName(column: number, row: number): string {
  return `${String.fromCharCode(65 + column)}${row + 1}`;
}

function panelBounds(ir: GeometryIRV1, layerIndexes: number[], included?: Map<number, Set<number>>): Pick<FabricationPanelV1, "minX" | "minY" | "maxX" | "maxY"> {
  if (!included) {
    // Unsplit panels keep the whole-crop canvas they have always had.
    return { minX: -(ir.widthMm + ir.laserKerfMm) / 2, minY: -(ir.heightMm + ir.laserKerfMm) / 2, maxX: (ir.widthMm + ir.laserKerfMm) / 2, maxY: (ir.heightMm + ir.laserKerfMm) / 2 };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const layerIndex of layerIndexes) {
    const layer = ir.layers[layerIndex];
    const indexes = included.get(layerIndex);
    if (!layer || !indexes) continue;
    for (const polygonIndex of indexes) {
      const polygon = layer.polygons[polygonIndex];
      if (!polygon) continue;
      // Measure the kerf-compensated ring the panel actually draws, not the
      // terrain ring: a miter join on a sharp corner reaches much further out
      // than half a kerf, and the canvas has to contain it.
      for (const ring of offsetClosedRing(polygon.outer, ir.laserKerfMm / 2, "miter")) {
        const bounds = ringBounds(ring);
        minX = Math.min(minX, bounds.minX);
        minY = Math.min(minY, bounds.minY);
        maxX = Math.max(maxX, bounds.maxX);
        maxY = Math.max(maxY, bounds.maxY);
      }
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  // Path coordinates are written to three decimals, so round the canvas
  // outward to the same precision or a rounded-up vertex lands outside it.
  const floor = (value: number) => Math.floor(value * 1000) / 1000;
  const ceil = (value: number) => Math.ceil(value * 1000) / 1000;
  return { minX: floor(minX), minY: floor(minY), maxX: ceil(maxX), maxY: ceil(maxY) };
}

function fabricationPanels(ir: GeometryIRV1): FabricationPanel[] {
  const families = nestFamilies(ir);
  const plan = ir.splitPlan;
  if (!plan) {
    return families.map((family) => ({ ...family, ...panelBounds(ir, family.layerIndexes) }));
  }
  // The largest canvas the machine holds: usable span plus the kerf the cut
  // envelope adds, which is how `planSeamGrid` sized the cells.
  const fits = (bounds: Pick<FabricationPanelV1, "minX" | "minY" | "maxX" | "maxY">) =>
    bounds.maxX - bounds.minX <= plan.usableWidthMm + ir.laserKerfMm + 1e-6 &&
    bounds.maxY - bounds.minY <= plan.usableHeightMm + ir.laserKerfMm + 1e-6;
  return families.flatMap((family) => {
    const roots = rootPolygonByPolygon(ir, family);
    const root = ir.layers[family.rootLayerIndex];
    if (!root) return [];
    // Sheet per root polygon, initially its seam cell. Nested polygons follow
    // the root polygon they are cut from.
    const sheetOf = new Map(root.pieces.map((piece) => [piece.polygonIndex, cellName(piece.column, piece.row)] as const));
    const exempt = new Set(root.pieces.filter((piece) => piece.exempt).map((piece) => piece.polygonIndex));
    const group = (): Map<string, Map<number, Set<number>>> => {
      const bySheet = new Map<string, Map<number, Set<number>>>();
      for (const layerIndex of family.layerIndexes) {
        const layer = ir.layers[layerIndex];
        if (!layer) continue;
        layer.polygons.forEach((_, polygonIndex) => {
          const rootIndex = roots.get(layerIndex)?.get(polygonIndex);
          const sheet = rootIndex === undefined ? undefined : sheetOf.get(rootIndex);
          if (!sheet) return;
          const included = bySheet.get(sheet) ?? new Map<number, Set<number>>();
          included.set(layerIndex, new Set([...(included.get(layerIndex) ?? []), polygonIndex]));
          bySheet.set(sheet, included);
        });
      }
      return bySheet;
    };
    const sheetFits = (sheets: Map<string, Map<number, Set<number>>>, name: string) => {
      const included = sheets.get(name);
      return !included || fits(panelBounds(ir, family.layerIndexes, included));
    };
    // An exempt piece is assigned to a cell by its centre and may reach past
    // that cell, so a cell's clipped pieces plus the straddler can outgrow the
    // bed. Peel straddlers onto extra sheets, widest first, until the cell fits;
    // a cell with no exempt piece left is already reported as oversize.
    let sheets = group();
    for (const cell of new Set(sheetOf.values())) {
      let extra = 0;
      while (!sheetFits(sheets, cell)) {
        const straddler = [...sheetOf.entries()]
          .filter(([polygonIndex, sheet]) => sheet === cell && exempt.has(polygonIndex))
          .map(([polygonIndex]) => ({ polygonIndex, bounds: ringBounds(root.polygons[polygonIndex]!.outer) }))
          .sort((left, right) => (right.bounds.maxX - right.bounds.minX) * (right.bounds.maxY - right.bounds.minY)
            - (left.bounds.maxX - left.bounds.minX) * (left.bounds.maxY - left.bounds.minY))[0];
        if (!straddler) break;
        let placed = false;
        for (let sheet = 1; sheet <= extra && !placed; sheet += 1) {
          sheetOf.set(straddler.polygonIndex, `${cell}-${sheet}`);
          const trial = group();
          if (sheetFits(trial, `${cell}-${sheet}`)) {
            sheets = trial;
            placed = true;
          }
        }
        if (!placed) {
          extra += 1;
          sheetOf.set(straddler.polygonIndex, `${cell}-${extra}`);
          sheets = group();
        }
      }
    }
    return [...sheets.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sheetName, included]) => ({
        ...family,
        cellName: sheetName,
        included,
        ...panelBounds(ir, family.layerIndexes, included),
      }));
  });
}

function omittedNestHoles(nests: FabricationNest[], layerIndex: number): Map<number, Set<number>> {
  const result = new Map<number, Set<number>>();
  nests.filter((nest) => nest.donorLayerIndex === layerIndex).forEach((nest) => nest.cavities.forEach((cavity) => {
    result.set(cavity.donorPolygonIndex, new Set([...(result.get(cavity.donorPolygonIndex) ?? []), cavity.donorHoleIndex]));
  }));
  return result;
}

type Operation = "cut" | "score" | "engrave" | "assembly";
const OPERATIONS: readonly Operation[] = ["engrave", "assembly", "score", "cut"];
const ENGRAVE_ONLY: readonly Operation[] = ["engrave", "assembly"];
/** A panel's per-operation layer groups in panel coordinates, built once and shared by every file that shows the panel. */
type PanelBodies = Record<Operation, string>;

/**
 * One sheet's share of a layer's markings.
 *
 * Routing clips markings against the union of a layer's pieces, and
 * `clipPolyline` rejoins intervals that meet at a shared coordinate, so a road
 * crossing a seam stays one continuous path in the IR - which is what the
 * preview and the master layout want. A single sheet must not engrave past its
 * own pieces, so narrow the geometry here instead. A label whose every stroke
 * lies on this sheet ships whole; one a seam cuts through is exploded into its
 * strokes and each stroke clipped, so both sheets carry their share of the
 * glyph. Closed marker artwork is intersected as a polygon so a fill stays a
 * closed region rather than an open arc.
 */
function panelMarkings(layer: LayerIR, included?: Set<number>): LayerIR["markings"] {
  if (!included) return layer.markings;
  const polygons = layer.polygons.filter((_, index) => included.has(index));
  if (!polygons.length) return [];
  const prepared = preparePolygons(polygons);
  const inside = (point: Point2D) => pointInPreparedPolygons(point, prepared);
  const parted = (mark: LayerIR["markings"][number], parts: Point2D[][], whole: boolean): LayerIR["markings"] => {
    if (whole && parts.length === 1) return [{ ...mark, points: parts[0]! }];
    return parts.map((points, index) => ({ ...mark, id: `${mark.id}-part-${index + 1}`, points }));
  };
  return layer.markings.flatMap((mark) => {
    const first = mark.points[0];
    if (!first) return [];
    if (mark.label) {
      const segments = labelLineSegments(mark.label, first, 0, 0, mark.labelRotationRad, mark.textStyle);
      if (segments.every(({ start, end }) => inside(start) && inside(end))) return [mark];
      const { label: _label, labelRotationRad: _rotation, textStyle: _style, ...stroke } = mark;
      return parted(stroke, segments.flatMap(({ start, end }) => clipPolyline([start, end], prepared)), false);
    }
    // A halo is a clearance gap, resolved against the whole layer by
    // `markerClearance`; it never serializes, so no sheet needs a copy.
    if (mark.knockout) return [];
    if (mark.points.length < 2) return inside(first) ? [mark] : [];
    if (mark.filled) {
      if (mark.points.every(inside) && (mark.holes ?? []).every((hole) => hole.every(inside))) return [mark];
      try {
        const clipped = normalizeMultiPolygon(polygonClipping.intersection(
          [[toRing(mark.points), ...(mark.holes ?? []).map(toRing)]] as MultiPolygon,
          polygons.map((polygon) => [toRing(polygon.outer), ...polygon.holes.map(toRing)]) as MultiPolygon,
        ) as MultiPolygon);
        if (clipped.length === 1) return [{ ...mark, points: clipped[0]!.outer, holes: clipped[0]!.holes }];
        return clipped.map((polygon, index) => ({ ...mark, id: `${mark.id}-part-${index + 1}`, points: polygon.outer, holes: polygon.holes }));
      } catch {
        // A degenerate ring the clipper refuses is not worth losing the sheet over.
        return inside(first) ? [mark] : [];
      }
    }
    return parted(mark, clipPolyline(mark.points, prepared), true);
  });
}

function panelBodies(ir: GeometryIRV1, panel: FabricationPanel): PanelBodies {
  const layers = panel.layerIndexes.map((index) => ir.layers[index]).filter((layer): layer is LayerIR => Boolean(layer));
  const body = (operation: Operation) => layers.map((layer) => {
    const included = panel.included?.get(layer.index);
    if (panel.included && !included?.size) return "";
    const paths = operation === "cut"
      ? layerCutPaths(layer, ir.laserKerfMm, omittedNestHoles(ir.fabricationNests, layer.index), included)
      : layerMarkingPaths(layer, operation === "assembly" ? "engrave" : operation, ir.lineStyle,
        operation === "assembly" ? ASSEMBLY_CATEGORIES : ARTWORK_CATEGORIES, panelMarkings(layer, included));
    // An unsplit package keeps the empty per-layer groups it always had, so
    // turning the work area off leaves every existing export byte-identical.
    return paths || (!panel.included && operation !== "assembly") ? `<g id="${layer.id}-${operation.toUpperCase()}">${paths}</g>` : "";
  }).join("");
  return { engrave: body("engrave"), assembly: body("assembly"), score: body("score"), cut: body("cut") };
}

function panelId(panel: FabricationPanel): string {
  return `fabrication-panel-${panel.rootLayerIndex + 1}${panel.cellName ? `-${panel.cellName.toLowerCase()}` : ""}`;
}

function panelOperationGroup(ir: GeometryIRV1, panel: FabricationPanel, operation: Operation, body: string, offsetX = 0, offsetY = 0): string {
  const layerIds = panel.layerIndexes.map((index) => ir.layers[index]?.id).filter(Boolean).join(" ");
  const transform = offsetX || offsetY ? ` transform="translate(${format(offsetX)} ${format(offsetY)})"` : "";
  const cell = panel.cellName ? ` data-cell="${escapeXml(panel.cellName)}"` : "";
  return `<g id="${panelId(panel)}-${operation.toUpperCase()}" data-layers="${escapeXml(layerIds)}"${cell}${transform}>${body}</g>`;
}

function operationGroup(operation: Operation, body: string, style: LineStyleV1): string {
  if (operation === "assembly") {
    // Omitted entirely when empty: an empty process would still show up as a
    // layer to configure in the machine's software.
    return /<path/.test(body) ? `<g id="ASSEMBLY" data-operation="ENGRAVE" fill="none" stroke="${ASSEMBLY}" stroke-width="${format(style.annotationMm)}">${body}</g>` : "";
  }
  const name = operation.toUpperCase();
  const color = operation === "cut" ? CUT : operation === "score" ? SCORE : ENGRAVE;
  const width = operation === "cut" ? "0.1" : format(operation === "score" ? style.waterMm : style.annotationMm);
  return `<g id="${name}" data-operation="${name}" fill="none" stroke="${color}" stroke-width="${width}"${operation === "cut" ? ' fill-rule="evenodd"' : ""}>${body}</g>`;
}

function panelToSvg(ir: GeometryIRV1, panel: FabricationPanel, bodies: PanelBodies, operations: readonly Operation[], kind: string): string {
  const layerIds = panel.layerIndexes.map((index) => ir.layers[index]?.id).filter(Boolean).join(", ");
  const body = operations.map((operation) => operationGroup(operation, panelOperationGroup(ir, panel, operation, bodies[operation]), ir.lineStyle)).join("");
  const cell = panel.cellName ? ` — cell ${panel.cellName}` : "";
  return svgDocument(panel.maxX - panel.minX, panel.maxY - panel.minY, body, `${ir.projectName} — ${kind} panel${cell} — ${layerIds}`, panel.minX, panel.minY);
}

function segmentOnCropBoundary(start: Point2D, end: Point2D, config: ProjectConfigV1): boolean {
  const epsilon = 0.02;
  if (config.cropShape === "circle") {
    // Contours are clipped to a polygon, not a true circle, and simplified
    // afterwards. A vertex on the crop can therefore sit up to one chord
    // sagitta inside the radius, and a simplified run of crop edges bows
    // inward by up to the simplification tolerance as well. A fixed epsilon
    // smaller than that sagitta let whole arcs through as engraved stubs.
    const radius = cropRadiusMm(config);
    const sagitta = radius * (1 - Math.cos(Math.PI / CIRCLE_CROP_SEGMENTS));
    const inner = radius - sagitta - config.minimumFeatureMm * CONTOUR_SIMPLIFICATION_FACTOR - epsilon;
    const onBoundary = (point: Point2D) => {
      const distance = Math.hypot(point.x, point.y);
      return distance >= inner && distance <= radius + epsilon;
    };
    return onBoundary(start) && onBoundary(end) && onBoundary(pointAt(start, end, 0.5));
  }
  const halfWidth = config.widthMm / 2;
  const halfHeight = config.heightMm / 2;
  return (Math.abs(start.x - halfWidth) <= epsilon && Math.abs(end.x - halfWidth) <= epsilon) ||
    (Math.abs(start.x + halfWidth) <= epsilon && Math.abs(end.x + halfWidth) <= epsilon) ||
    (Math.abs(start.y - halfHeight) <= epsilon && Math.abs(end.y - halfHeight) <= epsilon) ||
    (Math.abs(start.y + halfHeight) <= epsilon && Math.abs(end.y + halfHeight) <= epsilon);
}

/**
 * Filled contour polygons include pieces of the crop edge whenever terrain
 * continues beyond the artwork. Remove those edge-following pieces so a flat
 * topographic line terminates naturally at the optional border.
 */
function openContourPath(points: Point2D[], config: ProjectConfigV1): string {
  let result = "";
  let connected = false;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!;
    const end = points[index]!;
    if (segmentOnCropBoundary(start, end, config)) {
      connected = false;
      continue;
    }
    if (!connected) result += `M${format(start.x)} ${format(start.y)}`;
    result += `L${format(end.x)} ${format(end.y)}`;
    connected = true;
  }
  return result;
}

function flatContourPaths(ir: GeometryIRV1, config: ProjectConfigV1, indexContour: boolean, clearance?: MarkerClearance): string {
  return ir.layers.slice(1)
    .filter((layer) => (layer.index % config.engravingIndexInterval === 0) === indexContour)
    .flatMap((layer) => layer.polygons.flatMap((polygon, polygonIndex) => [polygon.outer, ...polygon.holes].map((ring, ringIndex) => {
      const data = clearLineData(openContourPath(ring, config), clearance);
      return data ? `<path id="contour-${layer.index}-${polygonIndex}-${ringIndex}" data-elevation-m="${format(layer.elevationM)}" d="${data}" ${ENGRAVE_LINE}/>` : "";
    })))
    .join("");
}

function flatMarkingPaths(ir: GeometryIRV1, clearance?: MarkerClearance): string {
  // Score paths in layered projects (notably water) become ordinary engraved
  // lines in a flat project; the output deliberately has one operation only.
  const markings = ir.layers.flatMap((layer) => layer.markings)
    .filter((mark) => !mark.id.startsWith("alignment-") && !mark.id.startsWith("piece-"));
  return ARTWORK_CATEGORIES.map((category) => {
    const paths = markings.filter((mark) => engravingCategory(mark) === category).map((mark) => markingPath(mark, clearance)).join("");
    return paths ? `<g id="ENGRAVE-${category}"${categoryStrokeAttributes(category, ir.lineStyle)}>${paths}</g>` : "";
  }).join("");
}

function engravingWaterPatternPaths(ir: GeometryIRV1, config: ProjectConfigV1, clearance?: MarkerClearance): string {
  const strokes = waterPatternStrokes(config.waterFillPattern, ir.waterPatternAreas, config.widthMm, config.heightMm, ir.lineStyle.waterMm);
  if (!strokes.length) return "";
  const paths = strokes.map((points, index) => `<path id="water-fill-${config.waterFillPattern}-${index + 1}" d="${clearLineData(pathData(points), clearance)}" ${ENGRAVE_LINE}/>`).join("");
  return `<g id="ENGRAVE-water-fill" data-water-pattern="${config.waterFillPattern}" stroke-width="${format(ir.lineStyle.waterMm)}">${paths}</g>`;
}

function engravingBorder(config: ProjectConfigV1): string {
  if (!config.showEngravingBorder) return "";
  if (config.cropShape === "circle") return `<circle id="engraving-border" cx="0" cy="0" r="${format(cropRadiusMm(config))}" ${ENGRAVE_LINE}/>`;
  return `<rect id="engraving-border" x="${format(-config.widthMm / 2)}" y="${format(-config.heightMm / 2)}" width="${format(config.widthMm)}" height="${format(config.heightMm)}" ${ENGRAVE_LINE}/>`;
}

/** One physical-size, engrave-only artwork with no cut or score operations. */
export function engravingToSvg(ir: GeometryIRV1, config: ProjectConfigV1): string {
  const clearance = markerClearance(ir.layers);
  const minor = flatContourPaths(ir, config, false, clearance);
  const index = flatContourPaths(ir, config, true, clearance);
  const style = ir.lineStyle;
  const body = `<g id="ENGRAVE" data-operation="ENGRAVE" fill="none" stroke="${ENGRAVE}" stroke-linecap="round" stroke-linejoin="round">${engravingWaterPatternPaths(ir, config, clearance)}<g id="ENGRAVE-contours-minor" stroke-width="${format(style.contourMm)}">${minor}</g><g id="ENGRAVE-contours-index" stroke-width="${format(style.indexContourMm)}">${index}</g><g id="ENGRAVE-map-details" stroke-width="${format(style.annotationMm)}">${flatMarkingPaths(ir, clearance)}</g><g id="ENGRAVE-border" stroke-width="${format(style.borderMm)}">${engravingBorder(config)}</g></g>`;
  return svgDocument(config.widthMm, config.heightMm, body, `${ir.projectName} — flat topographic engraving`);
}

export function masterToSvg(ir: GeometryIRV1, panels = fabricationPanels(ir), bodies = panels.map((panel) => panelBodies(ir, panel))): string {
  const gap = 12;
  // Split panels differ in size, so the grid cell is the largest of them.
  const panelWidth = Math.max(...panels.map((panel) => panel.maxX - panel.minX), 1);
  const panelHeight = Math.max(...panels.map((panel) => panel.maxY - panel.minY), 1);
  const columns = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(panels.length))));
  const rows = Math.ceil(panels.length / columns);
  const width = columns * panelWidth + (columns - 1) * gap;
  const height = rows * panelHeight + (rows - 1) * gap;
  const startX = -width / 2 + panelWidth / 2;
  const startY = -height / 2 + panelHeight / 2;
  // Panels keep panel coordinates and are placed by a group transform, so the
  // master reuses each panel's path data instead of re-offsetting every point.
  const body = OPERATIONS.map((operation) => operationGroup(operation, panels.map((panel, index) => {
    const offsetX = startX + (index % columns) * (panelWidth + gap) - (panel.minX + panel.maxX) / 2;
    const offsetY = startY + Math.floor(index / columns) * (panelHeight + gap) - (panel.minY + panel.maxY) / 2;
    return panelOperationGroup(ir, panel, operation, bodies[index]![operation], offsetX, offsetY);
  }).join(""), ir.lineStyle)).join("");
  return svgDocument(width, height, body, `${ir.projectName} — master layout`, -width / 2, -height / 2);
}

export function assemblyGuideToSvg(ir: GeometryIRV1): string {
  const width = 210;
  const height = 297;
  const scale = Math.min(150 / ir.widthMm, 130 / ir.heightMm);
  const stack = ir.layers.map((layer, index) => {
    const offsetX = 105;
    const offsetY = 90 + index * Math.min(2.2, 20 / ir.layers.length);
    const paths = layer.polygons.flatMap((polygon) => [polygon.outer, ...polygon.holes]).map((ring) => `<path d="${pathData(ring, offsetX, offsetY, true)}"/>`).join("");
    return `<g transform="scale(${format(scale)}) translate(${format(offsetX / scale - offsetX)} ${format(offsetY / scale - offsetY)})" fill="none" stroke="#33443b" stroke-width="${format(0.25 / scale)}">${paths}</g>`;
  }).join("");
  const body = `<rect width="210" height="297" fill="#f5f0e7"/><text x="20" y="25" font-family="sans-serif" font-size="9" font-weight="700" fill="#18241f">${escapeXml(ir.projectName)}</text><text x="20" y="38" font-family="sans-serif" font-size="4" fill="#5a6b61">Stack ${ir.layers.length} layers from layer 01 upward · ${format(displayLength(ir.layers[0]?.materialThicknessMm ?? 0, ir.units))} ${lengthUnit(ir.units)} material</text>${ir.splitPlan ? `<text x="20" y="46" font-family="sans-serif" font-size="4" fill="#5a6b61">Each layer is cut as ${ir.splitPlan.columns} x ${ir.splitPlan.rows} pieces; seams alternate between layers, so glue in layer order.</text>` : ""}${stack}<text x="20" y="260" font-family="sans-serif" font-size="4" fill="#18241f">Elevation range: ${Math.round(displayElevation(ir.minElevationM, ir.units))}–${Math.round(displayElevation(ir.maxElevationM, ir.units))} ${elevationUnit(ir.units)}</text><text x="20" y="271" font-family="sans-serif" font-size="3.2" fill="#5a6b61">Decorative terrain data only. Verify dimensions, material, kerf, power, and speed with a test cut.</text>`;
  return svgDocument(width, height, body, `${ir.projectName} — assembly guide`, 0, 0);
}

function roadAppearance(style: LineStyleV1): string {
  return style.roadStyle === "centerline" ? "centerlines" : `outlined major roads spaced ${format(style.majorRoadSpacingMm)} mm`;
}

/** README line for road style and line widths; map-detail widths are shared, `leading`/`trailing` are output-specific. */
function lineworkSummary(style: LineStyleV1, heading: string, leading: string[], trailing: string[]): string {
  const widths = [
    ...leading,
    `major roads ${format(style.majorRoadMm)} mm`, `local roads ${format(style.localRoadMm)} mm`, `trails ${format(style.trailMm)} mm (${style.trailPattern})`,
    `water ${format(style.waterMm)} mm`, `state/province boundaries ${format(style.boundaryMm)} mm (dashed)`, `latitude/longitude grid ${format(style.coordinateGridMm)} mm (dotted)`,
    ...trailing,
  ];
  return `Road appearance: ${roadAppearance(style)}, ${style.roadCap} endpoints. ${heading}: ${widths.join(", ")}.\n`;
}

function attributionText(ir: GeometryIRV1): string {
  return `${ir.attribution.map((item) => `${item.name} — ${item.license}\n${item.url}`).join("\n\n")}\n\nImagery sources used:\n${ir.imagerySources.length ? ir.imagerySources.join("\n") : "Not reported by source service"}`;
}

export function buildFabricationPackage(generated: GeometryIRV1, config: ProjectConfigV1): FabricationPackageV1 {
  const ir = { ...generated, projectId: config.id, projectName: config.name };
  if (config.outputMode !== "stack") throw new Error("Choose layered relief before exporting fabrication files.");
  const reason = exportBlockReason(ir, config);
  if (reason) throw new Error(reason);
  const base = safeName(config.name);
  const panels = fabricationPanels(ir);
  const bodies = panels.map((panel) => panelBodies(ir, panel));
  const panelFiles = panels.map((panel, index) => {
    const layers = panel.layerIndexes.map((layerIndex) => ir.layers[layerIndex]?.id.replace("layer-", "")).filter(Boolean).join("-");
    const cell = panel.cellName ? `-${panel.cellName.toLowerCase()}` : "";
    const filename = panel.layerIndexes.length === 1 ? `${base}-${ir.layers[panel.rootLayerIndex]?.id}${cell}.svg` : `${base}-panel-${String(index + 1).padStart(2, "0")}-layers-${layers}${cell}.svg`;
    const engravingFilename = filename.replace(/\.svg$/, "-engrave.svg");
    return {
      panel,
      file: { filename, blob: new Blob([panelToSvg(ir, panel, bodies[index]!, OPERATIONS, "fabrication")], { type: "image/svg+xml" }) } satisfies ExportFile,
      engravingFile: { filename: engravingFilename, blob: new Blob([panelToSvg(ir, panel, bodies[index]!, ENGRAVE_ONLY, "engraving")], { type: "image/svg+xml" }) } satisfies ExportFile,
    };
  });
  // A split layer is cut across several sheets, so a layer maps to a list.
  const filenamesByLayer = new Map<number, string[]>();
  panelFiles.forEach(({ panel, file }) => panel.layerIndexes.forEach((layerIndex) => {
    filenamesByLayer.set(layerIndex, [...(filenamesByLayer.get(layerIndex) ?? []), file.filename]);
  }));
  const master: ExportFile = { filename: `${base}-master.svg`, blob: new Blob([masterToSvg(ir, panels, bodies)], { type: "image/svg+xml" }) };
  const manifest = {
    schemaVersion: 1,
    project: config,
    result: {
      projectId: ir.projectId,
      generatedAt: ir.generatedAt,
      minElevationM: ir.minElevationM,
      maxElevationM: ir.maxElevationM,
      layers: ir.layers.map((layer) => ({
        id: layer.id,
        elevationM: layer.elevationM,
        filename: filenamesByLayer.get(layer.index)?.[0],
        filenames: filenamesByLayer.get(layer.index) ?? [],
        pieces: layer.pieces,
      })),
      fabrication: {
        panelCount: panels.length,
        originalPanelCount: ir.layers.length,
        workArea: ir.splitPlan ? {
          widthMm: config.workAreaWidthMm,
          heightMm: config.workAreaHeightMm,
          columns: ir.splitPlan.columns,
          rows: ir.splitPlan.rows,
          pitchXMm: ir.splitPlan.pitchXMm,
          pitchYMm: ir.splitPlan.pitchYMm,
          pieceCount: ir.layers.reduce((total, layer) => total + layer.pieces.length, 0),
        } : undefined,
        glueMarginMm: config.glueMarginMm,
        laserKerfMm: config.laserKerfMm,
        nests: ir.fabricationNests,
        panels: panelFiles.map(({ panel, file, engravingFile }) => ({
          filename: file.filename,
          engravingFilename: engravingFile.filename,
          cell: panel.cellName,
          widthMm: panel.maxX - panel.minX,
          heightMm: panel.maxY - panel.minY,
          layerIds: panel.layerIndexes.map((index) => ir.layers[index]?.id).filter(Boolean),
        })),
      },
      bounds: ir.bounds,
      resolutionM: ir.resolutionM,
      datasetVersion: ir.datasetVersion,
      warnings: ir.warnings,
      vectorStatus: ir.vectorStatus,
      lakeDataStatus: ir.lakeDataStatus,
      lakeDepths: ir.waterSurfaces.filter((surface) => surface.kind === "lake").map((surface) => ({
        id: surface.id, name: surface.name, hylakId: surface.hylakId,
        depthSource: surface.depthSource, surfaceElevationM: surface.surfaceElevationM,
        bedElevationM: surface.bedElevationM, unfittedBedElevationM: surface.unfittedBedElevationM,
        depthFitScale: surface.depthFitScale ?? 1,
        appliedDepthExaggeration: surface.appliedDepthExaggeration ?? config.waterDepthExaggeration,
      })),
      imagerySources: ir.imagerySources,
      terrainSelection: ir.terrainSelection,
    },
    attribution: ir.attribution,
  };
  const attribution = attributionText(ir);
  const cutUnit = lengthUnit(config.units);
  const shownLength = (valueMm: number) => `${format(displayLength(valueMm, config.units))} ${cutUnit}`;
  const alignment = config.showAlignmentGuides ? `Each lower layer includes an engraved outline inset ${shownLength(config.laserKerfMm)} beneath the layer directly above it, plus an Lxx label. These marks are designed to be hidden after assembly.\n\n` : "";
  const kerf = config.laserKerfMm > 0 ? `CUT paths include ${shownLength(config.laserKerfMm)} total kerf compensation: external cuts move outward and internal cuts move inward by half the kerf. Calibrate this value for your laser and material.\n\n` : "CUT paths have no kerf compensation. Calibrate your laser and material before fabrication.\n\n";
  // Layer count is derived, so the README states the scale relationship it came from.
  const horizontalScale = ir.horizontalScale ?? horizontalScaleFor(ir.widthMm, ir.bounds);
  const scale = horizontalScale > 0 ? ` (horizontal scale 1:${Math.round(1 / horizontalScale).toLocaleString("en-US")})` : "";
  const fittedDepths = ir.waterSurfaces.filter((surface) => surface.depthFitScale !== undefined)
    .map((surface) => `${surface.name ?? "Lake"}: fitted to ${(surface.depthFitScale! * 100).toFixed(1)}% of requested depth; ${surface.appliedDepthExaggeration!.toFixed(3)}x terrain depth scale.\n`).join("");
  const vertical = `Vertical exaggeration: ${ir.verticalExaggeration.toFixed(1)}x${scale}\n`;
  const linework = lineworkSummary(config.lineStyle, "Engraved line widths", [], [`labels and guides ${format(config.lineStyle.annotationMm)} mm`]);
  const seams = ir.splitPlan ? (() => {
    const pieces = ir.layers.reduce((total, layer) => total + layer.pieces.length, 0);
    const perLayer = `${ir.splitPlan!.columns} x ${ir.splitPlan!.rows}`;
    const ids = config.showAssemblyLabels
      ? `Each piece carries its assembly id (layer number and grid cell, e.g. L03-B2) engraved in green as a separate ASSEMBLY operation. Those marks sit where the next layer covers them, so they disappear once the stack is glued; a piece with no covered room carries no id, and the top layer carries none at all - use the panel filename for those.\n`
      : "Assembly ids are turned off. The panel filename is the only piece identifier.\n";
    return `This model is larger than the ${shownLength(config.workAreaWidthMm || config.widthMm)} x ${shownLength(config.workAreaHeightMm || config.heightMm)} ${cutUnit} work area, so each layer is cut as ${perLayer} pieces (${pieces} in total) that butt together. Every panel SVG holds one work-area cell and fits the machine; a piece kept whole across a seam ships on its own sheet (cell name with a numeric suffix) when it would not fit beside its cell.\n\nSeams shift half a tile on alternating layers, so a seam in one layer always sits over solid material in the layers above and below - glue the stack in layer order and the joints lock like brickwork. Seam edges get the same outward kerf compensation as every other cut edge, so pieces butt together at their nominal size.\n\n${ids}\n`;
  })() : "";
  const nesting = ir.fabricationNests.length ? `Material nesting reduced ${ir.layers.length} layer panels to ${panels.length} fabrication panels. Smaller layers share cut lines inside lower layers while preserving at least ${shownLength(config.glueMarginMm)} of covered glue land. Keep every loose cutout: nested pieces belong to the layer IDs listed in each panel filename and SVG data-layers attribute.\n\n` : config.optimizeMaterialUse ? (ir.splitPlan
    ? `No safe material nests fit the requested ${shownLength(config.glueMarginMm)} glue margin. A nested piece has to sit wholly inside one donor piece, and a work-area seam usually cuts through that room, so splitting a model normally costs its nesting.\n\n`
    : `No safe material nests fit the requested ${shownLength(config.glueMarginMm)} glue margin, so every layer remains on its own panel.\n\n`) : "Material-saving nesting is disabled.\n\n";
  const readme = `${ir.projectName}\n\n${ir.layers.length} layers at ${shownLength(config.materialThicknessMm)} each\nFinished stack height: ${shownLength(ir.layers.length * config.materialThicknessMm)}\n${vertical}${fittedDepths}${linework}Fabrication panels: ${panels.length}\n\nCUT ${CUT}\nSCORE ${SCORE}\nENGRAVE ${ENGRAVE}\n${ir.splitPlan && config.showAssemblyLabels ? `ASSEMBLY ${ASSEMBLY}\n` : ""}\nEvery complete panel and the master SVG place engraved and scored paths in named ENGRAVE and SCORE groups, both using Atomm blue for line engraving, separate from red CUT paths. Each panel also has a registered -engrave.svg companion containing the same ENGRAVE paths only. Use either the complete panel SVG, or pair its engraving-only companion with a cut workflow; do not process both engraving copies in the same job.\n\n${alignment}${kerf}${seams}${nesting}Import the master SVG into xTool Studio, or use the fabrication-panel SVGs. In xTool Studio, choose Score for blue linework and Cut for red outlines. Engrave fills closed shapes; use it only for intentionally filled markers, not alignment outlines, contours, or line labels. Marker clearances are gaps in the line geometry; there is no white engraving operation. Verify each color layer's processing type, dimensions, and material settings before fabrication. Terrain data is decorative and is not survey or engineering data.\n`;
  const files: ExportFile[] = [
    ...panelFiles.flatMap(({ file, engravingFile }) => [file, engravingFile]),
    master,
    { filename: `${base}-assembly-guide.svg`, blob: new Blob([assemblyGuideToSvg(ir)], { type: "image/svg+xml" }) },
    { filename: `${base}-project.json`, blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) },
    { filename: "README.txt", blob: new Blob([readme], { type: "text/plain" }) },
    { filename: "ATTRIBUTION.txt", blob: new Blob([attribution], { type: "text/plain" }) },
  ];
  if (files.reduce((total, file) => total + file.blob.size, 0) > MAX_EXPORT_PACKAGE_BYTES) throw new Error("The fabrication package exceeds Atomm's 100 MB export limit.");
  return {
    schemaVersion: 1,
    master,
    files,
  };
}

export function buildEngravingPackage(generated: GeometryIRV1, config: ProjectConfigV1): FabricationPackageV1 {
  const ir = { ...generated, projectId: config.id, projectName: config.name };
  if (config.outputMode !== "engraving") throw new Error("Choose flat engraving before exporting engraving artwork.");
  const reason = exportBlockReason(ir, config);
  if (reason) throw new Error(reason);
  const base = safeName(config.name);
  const master: ExportFile = { filename: `${base}-engraving.svg`, blob: new Blob([engravingToSvg(ir, config)], { type: "image/svg+xml" }) };
  const attribution = attributionText(ir);
  const manifest = {
    schemaVersion: 1,
    project: config,
    result: {
      projectId: ir.projectId,
      generatedAt: ir.generatedAt,
      outputMode: "engraving",
      contourCount: config.engravingContourCount,
      indexInterval: config.engravingIndexInterval,
      minElevationM: ir.minElevationM,
      maxElevationM: ir.maxElevationM,
      bounds: ir.bounds,
      resolutionM: ir.resolutionM,
      datasetVersion: ir.datasetVersion,
      warnings: ir.warnings,
      vectorStatus: ir.vectorStatus,
      lakeDataStatus: ir.lakeDataStatus,
      imagerySources: ir.imagerySources,
      terrainSelection: ir.terrainSelection,
    },
    attribution: ir.attribution,
  };
  const unit = lengthUnit(config.units);
  const size = `${format(displayLength(config.widthMm, config.units))} × ${format(displayLength(config.heightMm, config.units))} ${unit}`;
  const details = [
    config.showRoads ? "roads" : "",
    config.showTrails ? "trails" : "",
    config.showWater ? `water outlines${config.waterFillPattern !== "none" ? ` with ${config.waterFillPattern} fill` : ""}` : "",
    config.showBoundaries ? "state/province boundaries" : "",
    config.showCoordinateGrid ? "latitude/longitude grid" : "",
  ].filter(Boolean);
  const linework = lineworkSummary(config.lineStyle, "Line widths",
    [`minor contours ${format(config.lineStyle.contourMm)} mm`, `index contours ${format(config.lineStyle.indexContourMm)} mm`],
    [`annotations ${format(config.lineStyle.annotationMm)} mm`, `border ${format(config.lineStyle.borderMm)} mm`]);
  const readme = `${ir.projectName}\n\nFlat topographic engraving\nArtwork size: ${size}\nContour lines: ${config.engravingContourCount}\nIndex contour: every ${config.engravingIndexInterval} lines\nWater fill: ${config.showWater ? config.waterFillPattern : "none"}\n${linework}Map details: ${details.length ? details.join(", ") : "none"}\nBorder: ${config.showEngravingBorder ? "engraved" : "none"}\n\nThe SVG contains one blue ENGRAVE operation group and no CUT or SCORE paths. In xTool Studio, choose Score for blue linework. Engrave fills closed shapes; reserve it for intentionally filled markers. Marker clearances are gaps in the line geometry; there is no white engraving operation. Minor and index contours are separated into named subgroups so their line weights can be assigned independently. Verify physical dimensions, focus, power, speed, and material settings with a small test engraving before processing the final item. Terrain data is decorative and is not survey, navigation, or engineering data.\n`;
  const files: ExportFile[] = [
    master,
    { filename: `${base}-project.json`, blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) },
    { filename: "README.txt", blob: new Blob([readme], { type: "text/plain" }) },
    { filename: "ATTRIBUTION.txt", blob: new Blob([attribution], { type: "text/plain" }) },
  ];
  if (files.reduce((total, file) => total + file.blob.size, 0) > MAX_EXPORT_PACKAGE_BYTES) throw new Error("The engraving package exceeds Atomm's 100 MB export limit.");
  return { schemaVersion: 1, master, files };
}

export function buildProjectPackage(ir: GeometryIRV1, config: ProjectConfigV1): FabricationPackageV1 {
  return config.outputMode === "engraving" ? buildEngravingPackage(ir, config) : buildFabricationPackage(ir, config);
}
