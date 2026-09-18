import polygonClipping, { type MultiPolygon } from "polygon-clipping";
import { boundsOverlap, normalizeMultiPolygon, preparePolygons, ringBounds, toRing, type PreparedPolygons } from "./geometry2d.js";
import { offsetClosedRing } from "./offset.js";
import type { LayerIR, PaintRegionIR, PaintRegionKind, Point2D, Polygon2D, ProjectConfigV1, WaterSurfaceIR } from "./types.js";

/**
 * How far a paint window reaches under the layer stacked above it. A stencil
 * laid a hair off would otherwise leave bare material at the foot of the step;
 * the strip it paints is covered glue land, and the kerf already makes the
 * upper piece a touch larger than nominal, so the loss of bond is negligible.
 */
export const PAINT_BLEED_MM = 1.5;

/** One layer's material and everything stacked above it, as `generateGeometry` indexes them. */
export interface PaintLayerClip {
  layer: LayerIR;
  covering: PreparedPolygons;
}

/** Water that never got a carved surface (depth off): flat in the DEM, so one layer owns its whole face. */
export interface FlatWaterArea {
  layerIndex: number;
  polygons: Polygon2D[];
}

export interface PaintRegionSources {
  waterSurfaces: WaterSurfaceIR[];
  flatWater: FlatWaterArea[];
  /**
   * One elevation-grid cell in model millimeters. A carved basin is contoured
   * from cell samples, so its rim interpolates up to one cell past the vector
   * shoreline; the bed steps below the surface reach that far too.
   */
  cellPitchMm: number;
}

/**
 * Region polygons per kind for one layer. A future kind (public land, a park
 * boundary) adds a member to `PAINT_REGION_KINDS` and one entry here.
 *
 * Water belongs to every layer at or below its surface: the basin steps carved
 * under a lake are its bed, while material above the surface inside the
 * outline is an island and stays dry. On the surface layer itself the outline
 * is exact - the shelf inside it is at the waterline, the land beside it is
 * not. Below it, the outline grows by one cell so the contoured rim of the
 * basin is bed as well.
 */
const REGION_SOURCES: Record<PaintRegionKind, (layerIndex: number, sources: PaintRegionSources, grow: (polygons: Polygon2D[]) => Polygon2D[]) => Polygon2D[]> = {
  water: (layerIndex, { waterSurfaces, flatWater }, grow) => [
    ...waterSurfaces.filter((surface) => surface.layerIndex === layerIndex).flatMap((surface) => surface.polygons),
    ...grow(waterSurfaces.filter((surface) => surface.layerIndex > layerIndex).flatMap((surface) => surface.polygons)),
    ...flatWater.filter((area) => area.layerIndex === layerIndex).flatMap((area) => area.polygons),
    ...grow(flatWater.filter((area) => area.layerIndex > layerIndex).flatMap((area) => area.polygons)),
  ],
};

function toMultiPolygon(polygons: Polygon2D[]): MultiPolygon {
  return polygons.map((polygon) => [toRing(polygon.outer), ...polygon.holes.map(toRing)]) as MultiPolygon;
}

function tinyRing(points: Point2D[], minimumFeatureMm: number): boolean {
  if (points.length < 4) return true;
  const bounds = ringBounds(points);
  return bounds.maxX - bounds.minX < minimumFeatureMm || bounds.maxY - bounds.minY < minimumFeatureMm;
}

/**
 * Grow polygons by `distanceMm` with round joins. Outers grow and holes shrink
 * independently, then the shrunk holes are subtracted from the grown outers, so
 * a hole narrower than twice the distance closes up as it should.
 */
function dilatePolygons(polygons: Polygon2D[], distanceMm: number): Polygon2D[] {
  const outers = polygons.flatMap((polygon) => offsetClosedRing(polygon.outer, distanceMm, "round")).map((ring) => [toRing(ring)]) as MultiPolygon;
  if (!outers.length) return [];
  const holes = polygons.flatMap((polygon) => polygon.holes.flatMap((hole) => offsetClosedRing(hole, -distanceMm, "round"))).map((ring) => [toRing(ring)]) as MultiPolygon;
  const grown = polygonClipping.union(outers);
  return normalizeMultiPolygon(holes.length ? polygonClipping.difference(grown, holes) : grown);
}

/**
 * Paint windows for every piece of every layer: the region that stays visible
 * after assembly, extended `PAINT_BLEED_MM` under the layer above but never
 * onto the same layer's dry exposed material.
 *
 * Runs after splitting and nesting, so a polygon here is one cut piece and
 * cavities are already holes in it. Boolean ops throw on degenerate rings; one
 * sliver of water must not cost the whole generation, so each piece is its
 * own attempt.
 */
export function paintRegions(config: ProjectConfigV1, clips: PaintLayerClip[], sources: PaintRegionSources): PaintRegionIR[] {
  if (config.outputMode !== "stack" || !config.paintTemplates.length) return [];
  const regions: PaintRegionIR[] = [];
  const refine = (ring: Point2D[]) => (tinyRing(ring, config.minimumFeatureMm) ? undefined : ring);
  // Outlines grow the same way for every layer below their surface, so grow each set once.
  const grown = new Map<string, Polygon2D[]>();
  const grow = (polygons: Polygon2D[]): Polygon2D[] => {
    if (!polygons.length || !(sources.cellPitchMm > 0)) return polygons;
    const key = polygons.map((polygon) => `${polygon.outer.length}:${polygon.outer[0]?.x}:${polygon.outer[0]?.y}`).join("|");
    let result = grown.get(key);
    if (!result) {
      try {
        result = dilatePolygons(polygons, sources.cellPitchMm);
      } catch {
        result = polygons;
      }
      grown.set(key, result);
    }
    return result;
  };
  for (const kind of config.paintTemplates) {
    for (const { layer, covering } of clips) {
      const region = REGION_SOURCES[kind](layer.index, sources, grow);
      if (!region.length) continue;
      const regionPrepared = preparePolygons(region);
      const regionMulti = toMultiPolygon(region);
      layer.polygons.forEach((polygon, polygonIndex) => {
        const box = ringBounds(polygon.outer);
        if (!boundsOverlap(box, regionPrepared.bounds)) return;
        const near = covering.polygons.filter((_, index) => boundsOverlap(box, covering.outerBounds[index]!));
        try {
          const piece = toMultiPolygon([polygon]);
          const nearMulti = toMultiPolygon(near);
          const exposed = near.length ? polygonClipping.difference(piece, nearMulti) : piece;
          if (!exposed.length) return;
          const exact = polygonClipping.intersection(exposed, regionMulti);
          if (!exact.length) return;
          const covered = near.length ? polygonClipping.intersection(piece, nearMulti) : [];
          const allowed = covered.length ? polygonClipping.union(exact, covered) : exact;
          const dilated = dilatePolygons(normalizeMultiPolygon(exact), PAINT_BLEED_MM);
          const window = dilated.length ? polygonClipping.intersection(toMultiPolygon(dilated), allowed) : exact;
          const polygons = normalizeMultiPolygon(window, refine);
          if (polygons.length) regions.push({ kind, layerIndex: layer.index, polygonIndex, polygons });
        } catch {
          // A degenerate ring the clipper refuses: skip this piece's windows.
        }
      });
    }
  }
  return regions;
}
