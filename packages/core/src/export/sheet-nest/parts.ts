import { signedArea, simplifyClosedRing } from "../../primitives/geometry2d.js";
import { offsetClosedRing } from "../../primitives/offset.js";
import type { GeometryIRV1, NestPartV1, Point2D } from "../../types.js";
import { nestFamilies, rootPolygonByPolygon } from "../panel-layout.js";
import { convexHull } from "./transform.js";

/** Vertex budget per outline sent to the packer; more costs time without better layouts. */
export const MAX_OUTLINE_VERTICES = 400;

/** Outward error steps tried, in millimetres, until an outline fits the vertex budget. */
const SIMPLIFY_STEPS_MM = [0.05, 0.1, 0.2, 0.4, 0.8, 1.6];

function counterClockwise(ring: Point2D[]): Point2D[] {
  return signedArea(ring) < 0 ? [...ring].reverse() : ring;
}

/**
 * A closed, counter-clockwise ring containing everything the laser cuts for
 * this outer boundary: the kerf envelope, simplified only outward. Douglas-
 * Peucker keeps every dropped point within the tolerance of the thinned ring,
 * so growing the thinned ring by the same tolerance contains the original.
 */
export function partOutline(outer: Point2D[], kerfMm: number, maxVertices = MAX_OUTLINE_VERTICES): Point2D[] {
  const envelope = counterClockwise(offsetClosedRing(outer, kerfMm / 2, "miter")[0] ?? outer);
  if (envelope.length - 1 <= maxVertices) return envelope;
  for (const tolerance of SIMPLIFY_STEPS_MM) {
    const grown = offsetClosedRing(simplifyClosedRing(envelope, tolerance), tolerance, "miter")[0];
    if (grown && grown.length - 1 <= maxVertices) return counterClockwise(grown);
  }
  return convexHull(envelope);
}

/**
 * The rigid parts a project is cut as. A polygon cut out of another (a
 * material nest) shares its cut line with its donor, so it travels with the
 * donor's root polygon; everything else is a part of its own. Seam-split
 * layers already hold one polygon per piece.
 */
export function nestableParts(ir: GeometryIRV1): NestPartV1[] {
  const parts: NestPartV1[] = [];
  for (const family of nestFamilies(ir)) {
    const roots = rootPolygonByPolygon(ir, family);
    const root = ir.layers[family.rootLayerIndex];
    if (!root) continue;
    // Key: root layer and polygon the member is cut from.
    const groups = new Map<string, { rootLayerIndex: number; rootPolygonIndex: number; members: Map<number, number[]> }>();
    for (const layerIndex of family.layerIndexes) {
      const layer = ir.layers[layerIndex];
      layer?.polygons.forEach((polygon, polygonIndex) => {
        if (polygon.outer.length < 4) return;
        const rootPolygonIndex = roots.get(layerIndex)?.get(polygonIndex);
        // A polygon with no traced donor stands alone rather than being dropped.
        const [rootLayerIndex, rootIndex] = rootPolygonIndex === undefined ? [layerIndex, polygonIndex] : [family.rootLayerIndex, rootPolygonIndex];
        const key = `${rootLayerIndex}:${rootIndex}`;
        const group = groups.get(key) ?? { rootLayerIndex, rootPolygonIndex: rootIndex, members: new Map<number, number[]>() };
        group.members.set(layerIndex, [...(group.members.get(layerIndex) ?? []), polygonIndex]);
        groups.set(key, group);
      });
    }
    for (const group of groups.values()) {
      const layer = ir.layers[group.rootLayerIndex]!;
      const polygon = layer.polygons[group.rootPolygonIndex]!;
      const outline = partOutline(polygon.outer, ir.laserKerfMm);
      parts.push({
        id: `${layer.id}:${group.rootPolygonIndex}`,
        label: partLabel(ir, group.rootLayerIndex, group.rootPolygonIndex),
        rootLayerIndex: group.rootLayerIndex,
        members: [...group.members.entries()].sort(([left], [right]) => left - right).map(([layerIndex, polygonIndexes]) => ({ layerIndex, polygonIndexes: polygonIndexes.sort((left, right) => left - right) })),
        outline,
        areaMm2: Math.abs(signedArea(outline)),
      });
    }
  }
  const polygonIndexOf = (part: NestPartV1) => Number(part.id.slice(part.id.lastIndexOf(":") + 1));
  return parts.sort((left, right) => left.rootLayerIndex - right.rootLayerIndex || polygonIndexOf(left) - polygonIndexOf(right));
}

/** The seam piece id when the layer was split, otherwise `L03`, or `L03-2` for a layer's second island. */
function partLabel(ir: GeometryIRV1, layerIndex: number, polygonIndex: number): string {
  const layer = ir.layers[layerIndex]!;
  const piece = layer.pieces.find((candidate) => candidate.polygonIndex === polygonIndex);
  if (piece) return piece.id;
  const base = `L${String(layerIndex + 1).padStart(2, "0")}`;
  return layer.polygons.length > 1 ? `${base}-${polygonIndex + 1}` : base;
}
