import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";
import {
  type Bounds2D,
  boundsOverlap,
  normalizeMultiPolygon,
  ringBounds,
  toRing,
} from "./geometry2d.js";
import { MAX_SEAM_DIVISIONS, MAX_WORK_AREA_PIECES } from "./types.js";
import type { GeometryWarning, LayerIR, LayerPieceV1, Point2D, Polygon2D, ProjectConfigV1, SeamPlanV1 } from "./types.js";

/**
 * Millimeters the outermost cell edges reach past the material, so no
 * numerical crumb of terrain falls outside every cell. Interior seam
 * coordinates stay exact and are shared bit-for-bit by the two cells that
 * meet there, which is what keeps markings from fragmenting at a seam.
 */
const EDGE_OVERSHOOT_MM = 1;

/**
 * Signed shift of a layer's seams from the even-pitch grid. Even layers move
 * back and odd layers forward by half the offset, so every seam sits the full
 * offset away from the matching seam in the layers glued above and below it,
 * while each layer keeps the same number of cells. Splitting the offset
 * across both parities means a cell only ever grows by half of it.
 *
 * Parity rather than a longer period because only immediately adjacent layers
 * are glued to each other: layers N and N+2 sharing a grid is harmless, since
 * N+1 sits between them, solid across both seams.
 */
export function seamShift(layerIndex: number, offsetMm: number): number {
  return (layerIndex % 2 === 1 ? 0.5 : -0.5) * offsetMm;
}

/**
 * One axis of the seam grid: how many equal divisions, and the offset between
 * adjacent layers' seams.
 *
 * The end cells grow by half the offset, so the count is chosen against
 * `usable - offset / 2` rather than `usable`. The offset is held to half the
 * usable span, which keeps the shift under a quarter of the bed and therefore
 * under a pitch: no cell ever collapses or inverts.
 */
function planAxis(spanMm: number, usableMm: number, requestedOffsetMm: number): { count: number; offsetMm: number } {
  // The epsilon keeps a model that fits exactly at one division rather than
  // letting floating-point span/usable == 1.0000000000000002 split it.
  if (!Number.isFinite(usableMm) || spanMm / usableMm - 1e-9 <= 1) return { count: 1, offsetMm: 0 };
  const offsetMm = Math.min(Math.max(0, requestedOffsetMm), usableMm / 2);
  const count = Math.min(MAX_SEAM_DIVISIONS, Math.max(2, Math.ceil(spanMm / (usableMm - offsetMm / 2) - 1e-9)));
  return { count, offsetMm };
}

/**
 * The seam grid for a config, or undefined when the model already fits.
 *
 * Divisions are equal by construction (`pitch = span / count`), never full
 * tiles beside a sliver remainder. One kerf is subtracted from each axis
 * because a panel's cut envelope is `span + laserKerfMm`, matching how
 * `layerToSvg` already sizes its canvas.
 */
export function planSeamGrid(config: ProjectConfigV1): SeamPlanV1 | undefined {
  const usableWidthMm = config.workAreaWidthMm > 0 ? config.workAreaWidthMm - config.laserKerfMm : Number.POSITIVE_INFINITY;
  const usableHeightMm = config.workAreaHeightMm > 0 ? config.workAreaHeightMm - config.laserKerfMm : Number.POSITIVE_INFINITY;
  const x = planAxis(config.widthMm, usableWidthMm, config.seamOffsetMm);
  const y = planAxis(config.heightMm, usableHeightMm, config.seamOffsetMm);
  if (x.count === 1 && y.count === 1) return undefined;
  return {
    columns: x.count,
    rows: y.count,
    pitchXMm: config.widthMm / x.count,
    pitchYMm: config.heightMm / y.count,
    seamOffsetXMm: x.offsetMm,
    seamOffsetYMm: y.offsetMm,
    usableWidthMm,
    usableHeightMm,
  };
}

/**
 * Cell boundaries along one axis: always `count` cells, with every interior
 * seam moved by `shiftMm`. The end cells absorb the shift, one growing and
 * the other shrinking by the same amount.
 */
export function cellEdges(spanMm: number, count: number, shiftMm: number): number[] {
  const pitch = spanMm / count;
  const half = spanMm / 2;
  const edges = [-half - EDGE_OVERSHOOT_MM];
  for (let step = 1; step < count; step += 1) edges.push(-half + step * pitch + shiftMm);
  edges.push(half + EDGE_OVERSHOOT_MM);
  return edges;
}

function cellIndexAt(edges: number[], value: number): number {
  for (let index = 0; index < edges.length - 1; index += 1) {
    if (value < edges[index + 1]!) return index;
  }
  return Math.max(0, edges.length - 2);
}

function columnLetter(column: number): string {
  return String.fromCharCode(65 + column);
}

function closedRect(minX: number, minY: number, maxX: number, maxY: number): Point2D[] {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: minY },
  ];
}

function polygonRings(polygon: Polygon2D): Polygon {
  return [toRing(polygon.outer), ...polygon.holes.map(toRing)];
}

function polygonBounds(polygon: Polygon2D): Bounds2D {
  return ringBounds(polygon.outer);
}

function unionBounds(list: Bounds2D[]): Bounds2D | undefined {
  return list.reduce<Bounds2D | undefined>((total, bounds) => total ? {
    minX: Math.min(total.minX, bounds.minX),
    minY: Math.min(total.minY, bounds.minY),
    maxX: Math.max(total.maxX, bounds.maxX),
    maxY: Math.max(total.maxY, bounds.maxY),
  } : { ...bounds }, undefined);
}

interface CellPiece {
  polygon: Polygon2D;
  bounds: Bounds2D;
  column: number;
  row: number;
  /** Kept whole because its own bounds already fit the work area. */
  exempt: boolean;
}

function fitsWorkArea(bounds: Bounds2D, grid: SeamPlanV1): boolean {
  return bounds.maxX - bounds.minX <= grid.usableWidthMm + 1e-9
    && bounds.maxY - bounds.minY <= grid.usableHeightMm + 1e-9;
}

/**
 * How much edge two boxes share. Adjacent seam cells touch along one axis and
 * overlap along the other, so the longer span is the joint; boxes that miss
 * each other on either axis share nothing.
 */
function sharedEdgeLength(left: Bounds2D, right: Bounds2D): number {
  const x = Math.min(left.maxX, right.maxX) - Math.max(left.minX, right.minX);
  const y = Math.min(left.maxY, right.maxY) - Math.max(left.minY, right.minY);
  if (x < -1e-6 || y < -1e-6) return 0;
  return Math.max(x, y);
}

/**
 * Absorb pieces too narrow to cut into the neighbour they share the most seam
 * with. Never drops one: a deleted ring is deleted material, and a hole in the
 * model is worse than a fragile crumb the user can discard.
 */
function mergeSlivers(pieces: CellPiece[], minimumFeatureMm: number, grid: SeamPlanV1): { pieces: CellPiece[]; slivers: number } {
  const isSliver = (piece: CellPiece) => !piece.exempt &&
    (piece.bounds.maxX - piece.bounds.minX < minimumFeatureMm || piece.bounds.maxY - piece.bounds.minY < minimumFeatureMm);
  let remaining = [...pieces];
  const ordered = remaining.filter(isSliver)
    .sort((left, right) => (left.bounds.maxX - left.bounds.minX) * (left.bounds.maxY - left.bounds.minY)
      - (right.bounds.maxX - right.bounds.minX) * (right.bounds.maxY - right.bounds.minY));
  for (const sliver of ordered) {
    if (!remaining.includes(sliver)) continue;
    // Bounding boxes only say which pieces might touch; the union below is
    // what proves it, so walk the candidates in order of shared edge and take
    // the first that yields one piece still fitting the bed.
    const candidates = remaining
      .filter((piece) => piece !== sliver && !piece.exempt && Math.abs(piece.column - sliver.column) + Math.abs(piece.row - sliver.row) <= 1)
      .map((piece) => ({ piece, shared: sharedEdgeLength(piece.bounds, sliver.bounds) }))
      .filter(({ shared }) => shared > 0)
      .sort((left, right) => right.shared - left.shared);
    for (const { piece: target } of candidates) {
      const merged = normalizeMultiPolygon(
        polygonClipping.union(polygonRings(sliver.polygon), polygonRings(target.polygon)) as MultiPolygon,
      );
      // Corner-touching pieces union into two polygons: that is not one piece.
      if (merged.length !== 1) continue;
      const bounds = polygonBounds(merged[0]!);
      if (!fitsWorkArea(bounds, grid)) continue;
      const replacement: CellPiece = { polygon: merged[0]!, bounds, column: target.column, row: target.row, exempt: false };
      remaining = remaining.map((piece) => piece === target ? replacement : piece).filter((piece) => piece !== sliver);
      break;
    }
  }
  return { pieces: remaining, slivers: remaining.filter(isSliver).length };
}

function toLayerPieces(layerIndex: number, pieces: CellPiece[]): LayerPieceV1[] {
  const used = new Map<string, number>();
  return pieces.map((piece, polygonIndex) => {
    const base = `L${String(layerIndex + 1).padStart(2, "0")}-${columnLetter(piece.column)}${piece.row + 1}`;
    const occurrence = (used.get(base) ?? 0) + 1;
    used.set(base, occurrence);
    return {
      polygonIndex,
      id: occurrence === 1 ? base : `${base}-${occurrence}`,
      column: piece.column,
      row: piece.row,
      exempt: piece.exempt,
      widthMm: piece.bounds.maxX - piece.bounds.minX,
      heightMm: piece.bounds.maxY - piece.bounds.minY,
    };
  });
}

function splitLayer(config: ProjectConfigV1, layer: LayerIR, grid: SeamPlanV1): CellPiece[] {
  const xEdges = cellEdges(config.widthMm, grid.columns, seamShift(layer.index, grid.seamOffsetXMm));
  const yEdges = cellEdges(config.heightMm, grid.rows, seamShift(layer.index, grid.seamOffsetYMm));

  // Partition the input rather than subtracting exempt pieces from the output.
  // Layer polygons are pairwise disjoint (clipContours emits one per connected
  // component), so an exempt island cannot overlap anything else in its layer -
  // the union is preserved exactly, no boolean op runs along the exempt
  // boundary, and the exempt ring stays bit-identical to the unsplit run.
  const exempt: Polygon2D[] = [];
  const splittable: Polygon2D[] = [];
  for (const polygon of layer.polygons) {
    (fitsWorkArea(polygonBounds(polygon), grid) ? exempt : splittable).push(polygon);
  }

  const pieces: CellPiece[] = [];
  const splittableBounds = unionBounds(splittable.map(polygonBounds));
  if (splittableBounds) {
    const splittableRings = splittable.map(polygonRings) as MultiPolygon;
    for (let row = 0; row < yEdges.length - 1; row += 1) {
      for (let column = 0; column < xEdges.length - 1; column += 1) {
        const rect = closedRect(xEdges[column]!, yEdges[row]!, xEdges[column + 1]!, yEdges[row + 1]!);
        if (!boundsOverlap(ringBounds(rect), splittableBounds)) continue;
        const parts = normalizeMultiPolygon(polygonClipping.intersection(splittableRings, [toRing(rect)]) as MultiPolygon);
        for (const polygon of parts) pieces.push({ polygon, bounds: polygonBounds(polygon), column, row, exempt: false });
      }
    }
  }
  for (const polygon of exempt) {
    const bounds = polygonBounds(polygon);
    pieces.push({
      polygon,
      bounds,
      column: cellIndexAt(xEdges, (bounds.minX + bounds.maxX) / 2),
      row: cellIndexAt(yEdges, (bounds.minY + bounds.maxY) / 2),
      exempt: true,
    });
  }
  return pieces;
}

/**
 * Cut every layer into pieces that fit the machine work area, in place.
 *
 * Must run before `addMaterialNests`: nest cavities record indices into
 * `LayerIR.polygons` and into a donor polygon's `holes`, which splitting
 * renumbers, and a seam crossing a cavity would leave an open arc where a
 * closed hole belongs. Splitting first also makes `containingPolygonIndexes`
 * reject a cross-seam nest on its own, before any hole is pushed.
 */
export function splitLayersForWorkArea(config: ProjectConfigV1, layers: LayerIR[], warnings: GeometryWarning[]): SeamPlanV1 | undefined {
  for (const layer of layers) layer.pieces = [];
  const grid = planSeamGrid(config);
  if (!grid) return undefined;

  // Every layer has the same cell count, so this is the worst case before any
  // clipping. All or nothing: a half-split model is worse than an unsplit one.
  const worstCells = grid.columns * grid.rows;
  if (worstCells * layers.length > MAX_WORK_AREA_PIECES) {
    warnings.push({
      code: "WORK_AREA_UNSPLIT",
      message: `This work area would cut the model into about ${worstCells * layers.length} pieces, more than the ${MAX_WORK_AREA_PIECES} this tool emits. Use a larger work area or a smaller model.`,
    });
    return undefined;
  }

  let slivers = 0;
  const oversize: string[] = [];
  for (const layer of layers) {
    const merged = mergeSlivers(splitLayer(config, layer, grid), config.minimumFeatureMm, grid);
    slivers += merged.slivers;
    const ordered = merged.pieces.sort((left, right) =>
      left.row - right.row || left.column - right.column || left.bounds.minY - right.bounds.minY || left.bounds.minX - right.bounds.minX);
    layer.polygons = ordered.map((piece) => piece.polygon);
    layer.pieces = toLayerPieces(layer.index, ordered);
    ordered.forEach((piece, index) => {
      if (!fitsWorkArea(piece.bounds, grid)) oversize.push(layer.pieces[index]!.id);
    });
  }
  if (slivers) warnings.push({
    code: "SMALL_FEATURES",
    message: `${slivers} cut piece${slivers === 1 ? " is" : "s are"} narrower than the minimum feature size. Glue the offcut in place with its neighbour, or raise the work area so the seam misses it.`,
  });
  if (oversize.length) warnings.push({
    code: "WORK_AREA_OVERSIZE",
    message: `${oversize.length} piece${oversize.length === 1 ? "" : "s"} (${oversize.slice(0, 4).join(", ")}) remain larger than the work area. The seam grid stops at ${MAX_SEAM_DIVISIONS} divisions per axis; use a larger work area or a smaller model.`,
  });
  return grid;
}
