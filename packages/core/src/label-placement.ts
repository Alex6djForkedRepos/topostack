import { labelDimensions } from "./labels.js";
import {
  type Bounds2D,
  boundsContainBounds,
  boundsOverlap,
  close,
  pointAt,
  pointInBounds,
  pointInPolygon,
  pointInRing,
  ringBounds,
  ringFitsInsidePolygon,
  rotatedPoint,
  segmentsIntersect,
} from "./geometry2d.js";
import { DEFAULT_TEXT_STYLE, type LayerIR, type Point2D, type Polygon2D, type ProjectConfigV1, type TextStyleV1 } from "./types.js";

function labelBounds(label: string, origin: Point2D, style: TextStyleV1, padding = 0): Bounds2D {
  const dimensions = labelDimensions(label, style);
  return {
    minX: origin.x - padding,
    minY: origin.y - padding,
    maxX: origin.x + dimensions.width + padding,
    maxY: origin.y + dimensions.height + padding,
  };
}

function boundsPoints(bounds: Bounds2D): Point2D[] {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return [
    { x: bounds.minX, y: bounds.minY }, { x: centerX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
    { x: bounds.minX, y: centerY }, { x: centerX, y: centerY }, { x: bounds.maxX, y: centerY },
    { x: bounds.minX, y: bounds.maxY }, { x: centerX, y: bounds.maxY }, { x: bounds.maxX, y: bounds.maxY },
  ];
}

/**
 * Box prechecks below must never reject a pair the exact tests would accept.
 * Those tests use ~1e-8 orientation tolerances and ray casting that can land a
 * few ulps outside a ring's extent, so boxes are widened by this much first.
 */
const PRECHECK_SLACK = 1e-6;

function expanded(bounds: Bounds2D): Bounds2D {
  return { minX: bounds.minX - PRECHECK_SLACK, minY: bounds.minY - PRECHECK_SLACK, maxX: bounds.maxX + PRECHECK_SLACK, maxY: bounds.maxY + PRECHECK_SLACK };
}

/** Bounds of every ring, so holes that stray past their outer ring are still covered. */
function polygonBounds(polygon: Polygon2D): Bounds2D {
  return [polygon.outer, ...polygon.holes].map(ringBounds).reduce((union, bounds) => ({
    minX: Math.min(union.minX, bounds.minX),
    minY: Math.min(union.minY, bounds.minY),
    maxX: Math.max(union.maxX, bounds.maxX),
    maxY: Math.max(union.maxY, bounds.maxY),
  }));
}

/** Everything a marking can collide with: its path and, for labels, its engraved footprint. */
function markingBounds(marking: LayerIR["markings"][number]): Bounds2D {
  const bounds = ringBounds(marking.points);
  if (!marking.label || !marking.points[0]) return expanded(bounds);
  const label = ringBounds(labelFootprint(marking.label, marking.points[0], marking.labelRotationRad ?? 0, marking.textStyle ?? DEFAULT_TEXT_STYLE));
  return expanded({
    minX: Math.min(bounds.minX, label.minX),
    minY: Math.min(bounds.minY, label.minY),
    maxX: Math.max(bounds.maxX, label.maxX),
    maxY: Math.max(bounds.maxY, label.maxY),
  });
}

/** Markings paired with precomputed boxes, built once per placement call rather than per candidate. */
interface IndexedMarking {
  marking: LayerIR["markings"][number];
  bounds: Bounds2D;
}

function indexMarkings(markings: LayerIR["markings"]): IndexedMarking[] {
  return markings.map((marking) => ({ marking, bounds: markingBounds(marking) }));
}

function indexPolygons(polygons: Polygon2D[]): Array<{ polygon: Polygon2D; bounds: Bounds2D }> {
  return polygons.map((polygon) => ({ polygon, bounds: expanded(polygonBounds(polygon)) }));
}

function segmentIntersectsBounds(a: Point2D, b: Point2D, bounds: Bounds2D): boolean {
  if (pointInBounds(a, bounds) || pointInBounds(b, bounds)) return true;
  const topLeft = { x: bounds.minX, y: bounds.minY };
  const topRight = { x: bounds.maxX, y: bounds.minY };
  const bottomRight = { x: bounds.maxX, y: bounds.maxY };
  const bottomLeft = { x: bounds.minX, y: bounds.maxY };
  return segmentsIntersect(a, b, topLeft, topRight) || segmentsIntersect(a, b, topRight, bottomRight) ||
    segmentsIntersect(a, b, bottomRight, bottomLeft) || segmentsIntersect(a, b, bottomLeft, topLeft);
}

function boundsInsidePolygon(bounds: Bounds2D, polygon: Polygon2D): boolean {
  if (!boundsPoints(bounds).every((point) => pointInPolygon(point, polygon))) return false;
  const rings = [polygon.outer, ...polygon.holes];
  for (const ring of rings) {
    if (ring.some((point) => pointInBounds(point, bounds))) return false;
    for (let index = 0; index < ring.length - 1; index += 1) {
      const start = ring[index];
      const end = ring[index + 1];
      if (start && end && segmentIntersectsBounds(start, end, bounds)) return false;
    }
  }
  return true;
}

function labelFootprint(label: string, origin: Point2D, rotationRad: number, style: TextStyleV1, padding = 0.8): Point2D[] {
  const dimensions = labelDimensions(label, style);
  return close([
    { x: origin.x - padding, y: origin.y - padding },
    { x: origin.x + dimensions.width + padding, y: origin.y - padding },
    { x: origin.x + dimensions.width + padding, y: origin.y + dimensions.height + padding },
    { x: origin.x - padding, y: origin.y + dimensions.height + padding },
  ].map((point) => rotatedPoint(point, origin, rotationRad)));
}

function footprintBounds(footprint: Point2D[]): Bounds2D {
  return ringBounds(footprint);
}

function pathsIntersect(left: Point2D[], right: Point2D[]): boolean {
  for (let leftIndex = 0; leftIndex < left.length - 1; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length - 1; rightIndex += 1) {
      if (segmentsIntersect(left[leftIndex]!, left[leftIndex + 1]!, right[rightIndex]!, right[rightIndex + 1]!)) return true;
    }
  }
  return false;
}

function footprintIntersectsPolygons(footprint: Point2D[], polygons: Array<{ polygon: Polygon2D; bounds: Bounds2D }>): boolean {
  const bounds = ringBounds(footprint);
  return polygons.some(({ polygon, bounds: box }) => {
    if (!boundsOverlap(bounds, box)) return false;
    if (footprint.slice(0, -1).some((point) => pointInPolygon(point, polygon))) return true;
    if (polygon.outer.slice(0, -1).some((point) => pointInRing(point, footprint))) return true;
    return [polygon.outer, ...polygon.holes].some((ring) => pathsIntersect(footprint, ring));
  });
}

function markingIntersectsFootprint(marking: LayerIR["markings"][number], footprint: Point2D[]): boolean {
  if (marking.label && marking.points[0]) {
    const other = labelFootprint(marking.label, marking.points[0], marking.labelRotationRad ?? 0, marking.textStyle ?? DEFAULT_TEXT_STYLE);
    if (other.slice(0, -1).some((point) => pointInRing(point, footprint)) || footprint.slice(0, -1).some((point) => pointInRing(point, other))) return true;
    if (pathsIntersect(other, footprint)) return true;
  }
  return marking.points.some((point) => pointInRing(point, footprint)) || pathsIntersect(marking.points, footprint);
}

function markingIntersectsBounds(marking: LayerIR["markings"][number], bounds: Bounds2D): boolean {
  if (marking.label && marking.points[0] && boundsOverlap(footprintBounds(labelFootprint(marking.label, marking.points[0], marking.labelRotationRad ?? 0, marking.textStyle ?? DEFAULT_TEXT_STYLE)), bounds)) return true;
  for (let index = 0; index < marking.points.length - 1; index += 1) {
    const start = marking.points[index];
    const end = marking.points[index + 1];
    if (start && end && segmentIntersectsBounds(start, end, bounds)) return true;
  }
  return false;
}

// The candidate grid never changes; only its distance ordering to the preferred
// point does, so build it once.
const CANDIDATE_GRID: Point2D[] = (() => {
  const grid: Point2D[] = [];
  for (let y = -9; y <= 9; y += 1) {
    for (let x = -9; x <= 9; x += 1) grid.push({ x: x / 10, y: y / 10 });
  }
  return grid;
})();

function labelCandidates(preferred: Point2D): Point2D[] {
  const candidates: Point2D[] = [{ ...preferred }];
  CANDIDATE_GRID.forEach((candidate) => {
    if (Math.abs(candidate.x - preferred.x) > 1e-8 || Math.abs(candidate.y - preferred.y) > 1e-8) candidates.push(candidate);
  });
  return candidates.map((candidate, index) => ({ candidate, index })).sort((left, right) => {
    const leftDistance = (left.candidate.x - preferred.x) ** 2 + (left.candidate.y - preferred.y) ** 2;
    const rightDistance = (right.candidate.x - preferred.x) ** 2 + (right.candidate.y - preferred.y) ** 2;
    return leftDistance - rightDistance || left.index - right.index;
  }).map(({ candidate }) => candidate);
}

export function placeLabel(label: string, config: ProjectConfigV1, polygons: Polygon2D[], markings: LayerIR["markings"], preferred: Point2D, requiredPolygons?: Polygon2D[]): Point2D | undefined {
  const dimensions = labelDimensions(label, config.textStyle);
  const material = indexPolygons(polygons);
  const required = requiredPolygons && indexPolygons(requiredPolygons);
  const obstacles = indexMarkings(markings);
  // Every sampled point of the label box must be inside, so the box must sit inside the polygon's box.
  const inside = (bounds: Bounds2D) => ({ polygon, bounds: box }: { polygon: Polygon2D; bounds: Bounds2D }) =>
    boundsContainBounds(box, bounds) && boundsInsidePolygon(bounds, polygon);
  for (const candidate of labelCandidates(preferred)) {
    const center = { x: candidate.x * config.widthMm / 2, y: candidate.y * config.heightMm / 2 };
    const origin = { x: center.x - dimensions.width / 2, y: center.y - dimensions.height / 2 };
    const bounds = labelBounds(label, origin, config.textStyle, 0.8);
    const fitsMaterial = material.some(inside(bounds));
    const fitsRequirement = !required || required.some(inside(bounds));
    if (fitsMaterial && fitsRequirement && !obstacles.some((obstacle) => boundsOverlap(obstacle.bounds, bounds) && markingIntersectsBounds(obstacle.marking, bounds))) return origin;
  }
  return undefined;
}

export interface ElevationLabelPlacement {
  point: Point2D;
  rotationRad: number;
}

export type LinearLabelPlacement = ElevationLabelPlacement;

function pointAlongPolyline(points: Point2D[], cumulative: number[], distance: number): Point2D {
  const total = cumulative.at(-1) ?? 0;
  const target = Math.max(0, Math.min(total, distance));
  for (let index = 0; index < cumulative.length - 1; index += 1) {
    const startDistance = cumulative[index]!;
    const endDistance = cumulative[index + 1]!;
    if (target <= endDistance || index === cumulative.length - 2) {
      const start = points[index]!;
      const end = points[index + 1]!;
      return pointAt(start, end, endDistance > startDistance ? (target - startDistance) / (endDistance - startDistance) : 0);
    }
  }
  return points.at(-1)!;
}

/** Places a straight vector label beside the longest usable portion of a line. */
export function placeLinearLabel(label: string, config: ProjectConfigV1, layer: LayerIR, polylines: Point2D[][], excludedPolygons: Polygon2D[] = []): LinearLabelPlacement | undefined {
  const dimensions = labelDimensions(label, config.textStyle);
  const requiredSpan = dimensions.width + 2;
  const candidates = polylines.flatMap((points) => {
    if (points.length < 2) return [];
    const cumulative = [0];
    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index]!;
      const end = points[index + 1]!;
      cumulative.push(cumulative.at(-1)! + Math.hypot(end.x - start.x, end.y - start.y));
    }
    const total = cumulative.at(-1)!;
    if (total < requiredSpan) return [];
    return [0.5, 0.35, 0.65, 0.2, 0.8].flatMap((fraction) => {
      const centerDistance = total * fraction;
      if (centerDistance < requiredSpan / 2 || total - centerDistance < requiredSpan / 2) return [];
      const start = pointAlongPolyline(points, cumulative, centerDistance - requiredSpan / 2);
      const end = pointAlongPolyline(points, cumulative, centerDistance + requiredSpan / 2);
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      // A very curved span would make a straight engraved label misleading and
      // may cross back over the road. Gentle multi-segment bends are allowed.
      if (length < dimensions.width + 1) return [];
      return [{ start, end, length, routeLength: total }];
    });
  }).sort((left, right) => right.routeLength - left.routeLength || right.length - left.length || left.start.y - right.start.y || left.start.x - right.start.x);

  const material = indexPolygons(layer.polygons);
  const excluded = indexPolygons(excludedPolygons);
  let obstacles: IndexedMarking[] | undefined;
  for (const { start, end, length } of candidates) {
    let rotationRad = Math.atan2(end.y - start.y, end.x - start.x);
    if (rotationRad > Math.PI / 2 || rotationRad < -Math.PI / 2) rotationRad += rotationRad > 0 ? -Math.PI : Math.PI;
    const center = pointAt(start, end, 0.5);
    const normal = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
    const offset = dimensions.height + 2;
    for (const side of [1, -1]) {
      const labelCenter = { x: center.x + normal.x * offset * side, y: center.y + normal.y * offset * side };
      const point = labelOriginAtCenter(label, labelCenter, rotationRad, config.textStyle);
      const footprint = labelFootprint(label, point, rotationRad, config.textStyle);
      const bounds = ringBounds(footprint);
      if (!material.some(({ polygon, bounds: box }) => boundsContainBounds(box, bounds) && ringFitsInsidePolygon(footprint, polygon, 0))) continue;
      if (footprintIntersectsPolygons(footprint, excluded)) continue;
      obstacles ??= indexMarkings(layer.markings);
      if (obstacles.some((obstacle) => boundsOverlap(obstacle.bounds, bounds) && markingIntersectsFootprint(obstacle.marking, footprint))) continue;
      return { point, rotationRad };
    }
  }
  return undefined;
}

interface ElevationLabelCandidate extends ElevationLabelPlacement {
  center: Point2D;
  preferenceScore: number;
}

function contourAngleWithBottomDownslope(start: Point2D, end: Point2D, downslope: Point2D): number {
  let angle = Math.atan2(end.y - start.y, end.x - start.x);
  // In label-local coordinates +Y is the bottom of the glyphs. A contour can
  // be followed in either direction, so choose the 180° orientation whose
  // local +Y axis points toward lower terrain.
  const textDown = { x: -Math.sin(angle), y: Math.cos(angle) };
  if (textDown.x * downslope.x + textDown.y * downslope.y < 0) angle += Math.PI;
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function labelOriginAtCenter(label: string, center: Point2D, rotationRad: number, style: TextStyleV1): Point2D {
  const dimensions = labelDimensions(label, style);
  const localCenter = { x: dimensions.width / 2, y: dimensions.height / 2 };
  const cosine = Math.cos(rotationRad);
  const sine = Math.sin(rotationRad);
  return {
    x: center.x - (localCenter.x * cosine - localCenter.y * sine),
    y: center.y - (localCenter.x * sine + localCenter.y * cosine),
  };
}

function elevationLabelCandidates(label: string, config: ProjectConfigV1, layer: LayerIR, coveringLayer?: LayerIR, sharedObstacles?: IndexedMarking[]): ElevationLabelCandidate[] {
  // The label describes this layer's elevation, so it belongs beside this
  // layer's own contour. Using the covering layer's contour makes the label
  // appear to annotate the next elevation line instead.
  const contourPolygons = layer.polygons;
  const coveredPolygons = indexPolygons(coveringLayer?.polygons ?? []);
  const preferred = {
    x: config.elevationLabelPosition.x * config.widthMm / 2,
    y: config.elevationLabelPosition.y * config.heightMm / 2,
  };
  const dimensions = labelDimensions(label, config.textStyle);
  const normalOffset = dimensions.height / 2 + 1.6;
  const candidates: ElevationLabelCandidate[] = [];

  contourPolygons.forEach((polygon) => [polygon.outer, ...polygon.holes].forEach((ring) => {
    for (let index = 0; index < ring.length - 1; index += 1) {
      const start = ring[index];
      const end = ring[index + 1];
      if (!start || !end) continue;
      const length = Math.hypot(end.x - start.x, end.y - start.y);
      if (length < 1e-6) continue;
      const normal = { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
      const samples = length > dimensions.width * 1.4 ? [0.25, 0.5, 0.75] : [0.5];
      samples.forEach((sample) => [-1, 1].forEach((side) => {
        const contourPoint = pointAt(start, end, sample);
        // Valid candidates lie just inside this layer's material; downslope is
        // therefore back across its boundary, opposite the center offset.
        const downslope = { x: -normal.x * side, y: -normal.y * side };
        const rotationRad = contourAngleWithBottomDownslope(start, end, downslope);
        const center = {
          x: contourPoint.x + normal.x * normalOffset * side,
          y: contourPoint.y + normal.y * normalOffset * side,
        };
        const point = labelOriginAtCenter(label, center, rotationRad, config.textStyle);
        const preferenceScore = ((center.x - preferred.x) / config.widthMm) ** 2 + ((center.y - preferred.y) / config.heightMm) ** 2;
        candidates.push({ point, center, rotationRad, preferenceScore });
      }));
    }
  }));

  // Candidate generation above is cheap; the fit checks are not. Keep a
  // deterministic shortlist near the preferred point for stack optimization.
  candidates.sort((left, right) => left.preferenceScore - right.preferenceScore || left.point.y - right.point.y || left.point.x - right.point.x);
  const materialBounds = layer.polygons.map((polygon) => ringBounds(polygon.outer));
  // Most candidates fail the material test, so index obstacles only once one passes.
  let obstacles: IndexedMarking[] | undefined;
  const valid: ElevationLabelCandidate[] = [];
  for (const candidate of candidates) {
    const footprint = labelFootprint(label, candidate.point, candidate.rotationRad, config.textStyle);
    const bounds = footprintBounds(footprint);
    const fitsMaterial = layer.polygons.some((polygon, polygonIndex) =>
      boundsContainBounds(materialBounds[polygonIndex]!, bounds) && ringFitsInsidePolygon(footprint, polygon, 0));
    if (!fitsMaterial || footprintIntersectsPolygons(footprint, coveredPolygons)) continue;
    obstacles ??= indexMarkings(layer.markings);
    const collides = (obstacle: IndexedMarking) => boundsOverlap(obstacle.bounds, bounds) && markingIntersectsBounds(obstacle.marking, bounds);
    if (obstacles.some(collides) || sharedObstacles?.some(collides)) continue;
    valid.push(candidate);
    if (valid.length >= 48) break;
  }
  return valid;
}

export function placeElevationLabel(label: string, config: ProjectConfigV1, layer: LayerIR, coveringLayer?: LayerIR): ElevationLabelPlacement | undefined {
  const candidate = elevationLabelCandidates(label, config, layer, coveringLayer)[0];
  return candidate && { point: candidate.point, rotationRad: candidate.rotationRad };
}

export interface CoordinatedElevationLabel {
  label: string;
  placement: ElevationLabelPlacement;
}

function angleDifference(left: number, right: number): number {
  return Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
}

export interface SharedFaceLabelOptions {
  /** Markings engraved on the one physical face every contour shares. */
  markings: LayerIR["markings"];
  /** Layers that will actually receive their label; only these can collide. */
  labeled: (layer: LayerIR) => boolean;
}

function footprintsOverlap(left: Point2D[], right: Point2D[]): boolean {
  return left.slice(0, -1).some((point) => pointInRing(point, right)) ||
    right.slice(0, -1).some((point) => pointInRing(point, left)) ||
    pathsIntersect(left, right);
}

/**
 * Selects elevation labels as a stack instead of independently. Visibility is
 * still a hard constraint; among valid candidates, adjacent center drift is
 * weighted most heavily, followed by preferred-position and rotation drift.
 *
 * A flat engraving puts every contour and map detail on one face, so pass
 * `sharedFace` there: candidates then avoid that face's markings as well, and
 * selected labels are kept clear of each other.
 */
export function placeElevationLabelStack(labelsByLayer: string[][], config: ProjectConfigV1, layers: LayerIR[], sharedFace?: SharedFaceLabelOptions): Array<CoordinatedElevationLabel | undefined> {
  const sharedObstacles = sharedFace && indexMarkings(sharedFace.markings);
  const options = layers.map((layer, layerIndex) => {
    for (const label of labelsByLayer[layerIndex] ?? []) {
      // The shared face's own layer already checks those markings itself.
      const candidates = elevationLabelCandidates(label, config, layer, layers[layerIndex + 1], layer.markings === sharedFace?.markings ? undefined : sharedObstacles);
      if (candidates.length) return candidates.map((candidate) => ({ label, candidate }));
    }
    return [];
  });
  const result: Array<CoordinatedElevationLabel | undefined> = new Array(layers.length).fill(undefined);
  const diagonalSquared = config.widthMm ** 2 + config.heightMm ** 2;
  let segmentStart = 0;
  while (segmentStart < options.length) {
    while (segmentStart < options.length && !options[segmentStart]?.length) segmentStart += 1;
    if (segmentStart >= options.length) break;
    let segmentEnd = segmentStart;
    while (segmentEnd + 1 < options.length && options[segmentEnd + 1]?.length) segmentEnd += 1;
    let costs = options[segmentStart]!.map(({ candidate }) => candidate.preferenceScore);
    const backPointers: number[][] = [];
    for (let layerIndex = segmentStart + 1; layerIndex <= segmentEnd; layerIndex += 1) {
      const previous = options[layerIndex - 1]!;
      const current = options[layerIndex]!;
      const pointers: number[] = [];
      const nextCosts = current.map(({ candidate }) => {
        let best = Number.POSITIVE_INFINITY;
        let bestIndex = 0;
        previous.forEach(({ candidate: prior }, priorIndex) => {
          const drift = ((candidate.center.x - prior.center.x) ** 2 + (candidate.center.y - prior.center.y) ** 2) / diagonalSquared;
          const rotation = angleDifference(candidate.rotationRad, prior.rotationRad) / Math.PI;
          const score = costs[priorIndex]! + candidate.preferenceScore + 4 * drift + 0.25 * rotation ** 2;
          if (score < best) { best = score; bestIndex = priorIndex; }
        });
        pointers.push(bestIndex);
        return best;
      });
      backPointers.push(pointers);
      costs = nextCosts;
    }
    let selected = costs.reduce((best, cost, index) => cost < costs[best]! ? index : best, 0);
    for (let layerIndex = segmentEnd; layerIndex >= segmentStart; layerIndex -= 1) {
      const option = options[layerIndex]![selected]!;
      result[layerIndex] = { label: option.label, placement: { point: option.candidate.point, rotationRad: option.candidate.rotationRad } };
      if (layerIndex > segmentStart) selected = backPointers[layerIndex - segmentStart - 1]![selected]!;
    }
    segmentStart = segmentEnd + 1;
  }
  if (sharedFace) {
    // Adjacent bands rarely share space, but smoothing and simplification can
    // let two labels on one face touch. Keep earlier layers' choices and move
    // a later label to its best remaining candidate, or omit it.
    const placed: Point2D[][] = [];
    const footprint = (label: string, placement: ElevationLabelPlacement) => labelFootprint(label, placement.point, placement.rotationRad, config.textStyle);
    layers.forEach((layer, layerIndex) => {
      const selected = result[layerIndex];
      if (!selected || !sharedFace.labeled(layer)) return;
      const clear = (candidate: Point2D[]) => !placed.some((other) => footprintsOverlap(candidate, other));
      if (clear(footprint(selected.label, selected.placement))) {
        placed.push(footprint(selected.label, selected.placement));
        return;
      }
      const alternative = options[layerIndex]!.find(({ label, candidate }) => clear(footprint(label, candidate)));
      result[layerIndex] = alternative && { label: alternative.label, placement: { point: alternative.candidate.point, rotationRad: alternative.candidate.rotationRad } };
      if (alternative) placed.push(footprint(alternative.label, alternative.candidate));
    });
  }
  return result;
}
