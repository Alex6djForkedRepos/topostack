import { boundsOverlap, pointInRing, ringBounds, ringFitsInsidePolygon, segmentIntersectionT, signedArea } from "../primitives/geometry2d.js";
import { northArrowFootprint } from "../annotate/north-arrow.js";
import type { FabricationNest, LayerIR, Point2D, Polygon2D, ProjectConfigV1 } from "../types.js";


function containingPolygonIndexes(children: Polygon2D[], containers: Polygon2D[], marginMm: number, allowContainedHoles = false): number[] | undefined {
  const indexes: number[] = [];
  // Every vertex of a fitting ring lies inside the container's outer ring, so
  // a container whose box (with ray-casting slack) misses the ring's box cannot fit it.
  const containerBounds = containers.map((container) => ringBounds(container.outer));
  for (const child of children) {
    const childBounds = ringBounds(child.outer.slice(0, -1));
    const containerIndex = containers.findIndex((container, index) => {
      const bounds = containerBounds[index]!;
      return childBounds.minX >= bounds.minX - 1e-6 && childBounds.maxX <= bounds.maxX + 1e-6 && childBounds.minY >= bounds.minY - 1e-6 && childBounds.maxY <= bounds.maxY + 1e-6 &&
        ringFitsInsidePolygon(child.outer, container, marginMm, allowContainedHoles);
    });
    if (containerIndex < 0) return undefined;
    indexes.push(containerIndex);
  }
  return indexes;
}

function ringsOverlap(left: Point2D[], right: Point2D[]): boolean {
  if (!boundsOverlap(ringBounds(left), ringBounds(right))) return false;
  if (left.some((point) => pointInRing(point, right)) || right.some((point) => pointInRing(point, left))) return true;
  for (let leftIndex = 0; leftIndex < left.length - 1; leftIndex += 1) {
    const leftStart = left[leftIndex];
    const leftEnd = left[leftIndex + 1];
    if (!leftStart || !leftEnd) continue;
    for (let rightIndex = 0; rightIndex < right.length - 1; rightIndex += 1) {
      const rightStart = right[rightIndex];
      const rightEnd = right[rightIndex + 1];
      if (rightStart && rightEnd && segmentIntersectionT(leftStart, leftEnd, rightStart, rightEnd) !== undefined) return true;
    }
  }
  return false;
}

// Re-validation of an existing nest after a later nest carved cavities into its
// covering layer. Contained holes are allowed here because by then every hole
// inside the nested ring is a chained cavity that the creation-time check below
// already proved is covered one level higher — unlike terrain holes, which the
// creation-time check rejects.
function nestHasGlueMargin(nest: FabricationNest, layers: LayerIR[], laserKerfMm: number): boolean {
  const nestedLayer = layers[nest.nestedLayerIndex];
  const coveringLayer = layers[nest.donorLayerIndex + 1];
  return Boolean(nestedLayer && coveringLayer && containingPolygonIndexes(nestedLayer.polygons, coveringLayer.polygons, nest.glueMarginMm + laserKerfMm, true));
}

export function addMaterialNests(config: ProjectConfigV1, layers: LayerIR[]): FabricationNest[] {
  if (!config.optimizeMaterialUse) return [];
  const nests: FabricationNest[] = [];
  const nestedLayersWithParents = new Set<number>();
  const requiredClearanceMm = config.glueMarginMm + config.laserKerfMm;
  for (let donorLayerIndex = 0; donorLayerIndex < layers.length - 2; donorLayerIndex += 1) {
    const protectedNorthArrow = donorLayerIndex === 0 && config.showNorthArrow ? northArrowFootprint(config) : undefined;
    for (let nestedLayerIndex = donorLayerIndex + 2; nestedLayerIndex < layers.length; nestedLayerIndex += 1) {
      if (nestedLayersWithParents.has(nestedLayerIndex)) continue;
      const nestedLayer = layers[nestedLayerIndex];
      if (!nestedLayer || nestedLayer.polygons.length === 0) continue;
      const donorLayer = layers[donorLayerIndex];
      const coveringLayer = layers[donorLayerIndex + 1];
      if (!donorLayer || !coveringLayer || coveringLayer.polygons.length === 0) continue;
      if (protectedNorthArrow && nestedLayer.polygons.some((polygon) => ringsOverlap(protectedNorthArrow, polygon.outer))) continue;
      // The covering layer must not have terrain holes inside the nested ring:
      // nothing above covers a terrain hole, so the cavity carved into the
      // donor would be visible through it in the assembled model. At creation
      // time the covering layer has no cavity holes yet (donors ascend), so
      // every contained hole is terrain — reject them all.
      if (!containingPolygonIndexes(nestedLayer.polygons, coveringLayer.polygons, requiredClearanceMm)) continue;
      const donorPolygonIndexes = containingPolygonIndexes(nestedLayer.polygons, donorLayer.polygons, requiredClearanceMm);
      if (!donorPolygonIndexes) continue;
      const cavities = nestedLayer.polygons.map((polygon, nestedPolygonIndex) => {
        const donorPolygonIndex = donorPolygonIndexes[nestedPolygonIndex]!;
        const donorPolygon = donorLayer.polygons[donorPolygonIndex]!;
        const donorHoleIndex = donorPolygon.holes.length;
        donorPolygon.holes.push(signedArea(polygon.outer) > 0 ? [...polygon.outer].reverse() : [...polygon.outer]);
        return { donorPolygonIndex, donorHoleIndex, nestedPolygonIndex };
      });
      const nest: FabricationNest = {
        id: `nest-${nestedLayer.id}-inside-${donorLayer.id}`,
        donorLayerIndex,
        nestedLayerIndex,
        glueMarginMm: config.glueMarginMm,
        cavities,
      };
      const invalidatedAdjacentNest = nests.some((existingNest) => existingNest.donorLayerIndex + 1 === donorLayerIndex && !nestHasGlueMargin(existingNest, layers, config.laserKerfMm));
      if (invalidatedAdjacentNest) {
        [...cavities].reverse().forEach((cavity) => donorLayer.polygons[cavity.donorPolygonIndex]?.holes.splice(cavity.donorHoleIndex, 1));
        continue;
      }
      nests.push(nest);
      nestedLayersWithParents.add(nestedLayerIndex);
      break;
    }
  }
  return nests;
}

export function polygonCenter(polygon: Polygon2D, config: ProjectConfigV1): Point2D {
  // Loops, not Math.min(...spread): large rings overflow the argument stack in Safari.
  const bounds = ringBounds(polygon.outer.slice(0, -1));
  return {
    x: ((bounds.minX + bounds.maxX) / 2) / (config.widthMm / 2),
    y: ((bounds.minY + bounds.maxY) / 2) / (config.heightMm / 2),
  };
}
