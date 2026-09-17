import { smoothLakeShorelines } from "./lake-shoreline.js";
import { cropBoundary as boundary, cropElevationRange, cropRadiusMm } from "./crop.js";
import { contours } from "d3-contour";
import polygonClipping, { type MultiPolygon, type Pair, type Ring } from "polygon-clipping";
import {
  boundsOverlap,
  clamp,
  clipPolyline,
  close,
  distanceToSegment,
  mercatorWorldY,
  normalizeMultiPolygon,
  pointInPreparedPolygons,
  pointInRing,
  type PreparedPolygons,
  preparePolygons,
  ringBounds,
  ringFitsInsidePolygon,
  segmentIntersectionT,
  signedArea,
  toPoint,
  toRing,
} from "./geometry2d.js";
import { sampleIndexAt, sampleOffset } from "./grid.js";
import { labelDimensions, labelLineSegments } from "./labels.js";
import { addLabelObstacles, indexLabelLayer, placeElevationLabelStack, placeLabel, placeLinearLabel } from "./label-placement.js";
import { geoPointToMapPoint, longitudeInBounds, markerSymbolCenterForAnchor, markerSymbolPaths } from "./markers.js";
import { markerLayerPolygons } from "./marker-placement.js";
import { offsetClosedRing } from "./offset.js";
import { northArrowFootprint, northArrowMarkings } from "./north-arrow.js";
import { sourceRequirements } from "./source-requirements.js";
import { splitLayersForWorkArea } from "./split.js";
import { displayElevation, elevationUnit, FEET_PER_METER } from "./units.js";
import { CUSTOM_LINE_KINDS, MAP_MARKER_CLEARANCE_MM, MAP_MARKER_SIZE_MM, MAP_MARKER_MIN_SIZE_MM, MAP_MARKER_MAX_SIZE_MM, MARKER_SYMBOLS, MAX_CUSTOM_DATA_POINTS, MAX_CUSTOM_LINE_POINTS, MAX_CUSTOM_LINES, MAX_MAP_MARKERS, MAX_PROJECT_DIMENSION_MM, MAX_PROJECT_NAME_LENGTH, MAX_WATER_DEPTH_EXAGGERATION, MIN_WORK_AREA_MM, MIN_WATER_DEPTH_EXAGGERATION, MAX_VERTICAL_EXAGGERATION, MIN_LAYER_COUNT, MIN_VERTICAL_EXAGGERATION, NORTH_ARROW_ANCHORS, NORTH_ARROW_MAX_MAP_FRACTION, NORTH_ARROW_MAX_SIZE_MM, NORTH_ARROW_MIN_SIZE_MM, NORTH_ARROW_STYLES, SEA_LEVEL_M } from "./types.js";
import { type CarvedWater, carveWaterDepth, clampCarveToLadder, fitLakesToLadder } from "./water.js";
import type {
  ElevationGrid,
  GeoBounds,
  GeometryIRV1,
  GeometryWarning,
  FabricationNest,
  LayerIR,
  MarkingFeature,
  Point2D,
  OperationPath,
  Polygon2D,
  ProjectConfigV1,
  SourceBundleV1,
  TerrainStackPlan,
  TransportationClass,
  WaterAreaV1,
  WaterSurfaceIR,
} from "./types.js";

const TRANSPORTATION_LABEL_LIMIT = 80;

/** Douglas-Peucker tolerance for contour rings, as a fraction of the minimum feature size. */
export const CONTOUR_SIMPLIFICATION_FACTOR = 0.18;

function assertGeographicBounds(bounds: GeoBounds, label: "Project" | "Source"): void {
  if (![bounds.west, bounds.south, bounds.east, bounds.north].every(Number.isFinite)) throw new Error(`${label} geographic bounds must be finite.`);
  if (bounds.west >= bounds.east || bounds.south >= bounds.north) throw new Error(`${label} geographic bounds must be ordered west-to-east and south-to-north.`);
  if (bounds.east - bounds.west > 360) throw new Error(`${label} longitude span cannot exceed 360 degrees.`);
  if (bounds.west < -540 || bounds.east > 540) throw new Error(`${label} longitudes exceed the supported unwrapped world range.`);
  if (bounds.south < -85.0511 || bounds.north > 85.0511) throw new Error(`${label} latitude bounds exceed Web Mercator coverage.`);
}


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

function addMaterialNests(config: ProjectConfigV1, layers: LayerIR[]): FabricationNest[] {
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

function polygonCenter(polygon: Polygon2D, config: ProjectConfigV1): Point2D {
  // Loops, not Math.min(...spread): large rings overflow the argument stack in Safari.
  const bounds = ringBounds(polygon.outer.slice(0, -1));
  return {
    x: ((bounds.minX + bounds.maxX) / 2) / (config.widthMm / 2),
    y: ((bounds.minY + bounds.maxY) / 2) / (config.heightMm / 2),
  };
}

function offsetPolyline(points: Point2D[], distanceMm: number): Point2D[] {
  // A zero-length leg has no direction, and a {0, 0} normal averaged in cancels
  // a real neighbour out: three identical consecutive points used to collapse
  // the offset back onto the centerline. Drop them before taking normals.
  const path = points.filter((point, index) => index === 0 ||
    Math.hypot(point.x - points[index - 1]!.x, point.y - points[index - 1]!.y) > 1e-9);
  if (path.length < 2) return [];
  // A road drawn as a closed loop has to join at its seam. Treated as open, the
  // shared endpoint takes a single segment's normal instead of the average of
  // the two meeting there, which notches the outline where the ends meet.
  const closed = path.length > 3 && Math.hypot(path.at(-1)!.x - path[0]!.x, path.at(-1)!.y - path[0]!.y) <= 1e-9;
  // The closing copy is the first point again, so the loop's own vertices are
  // the path without it, and its last segment wraps around to index 0.
  const vertices = closed ? path.slice(0, -1) : path;
  const segmentCount = closed ? vertices.length : vertices.length - 1;
  const segmentNormals = Array.from({ length: segmentCount }, (_, index) => {
    const start = vertices[index]!;
    const end = vertices[(index + 1) % vertices.length]!;
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    return { x: -(end.y - start.y) / length, y: (end.x - start.x) / length };
  });
  const offset = vertices.map((point, index) => {
    // An open path's endpoints keep their one segment's normal; a loop's seam
    // averages the segments on either side of it like any other vertex.
    const previous = segmentNormals[closed ? (index + segmentCount - 1) % segmentCount : Math.max(0, index - 1)]!;
    const next = segmentNormals[closed ? index : Math.min(segmentCount - 1, index)]!;
    const sum = { x: previous.x + next.x, y: previous.y + next.y };
    const length = Math.hypot(sum.x, sum.y);
    const normal = length > 1e-6 ? { x: sum.x / length, y: sum.y / length } : next;
    const dot = Math.max(0.5, Math.abs(normal.x * next.x + normal.y * next.y));
    const miter = Math.min(Math.abs(distanceMm) / dot, Math.abs(distanceMm) * 2) * Math.sign(distanceMm || 1);
    return { x: point.x + normal.x * miter, y: point.y + normal.y * miter };
  });
  return closed ? [...offset, { ...offset[0]! }] : offset;
}

/** Unclipped outline paths for a feature drawn as an outlined major road; undefined when it is drawn as its centerline. */
function transportationOutlines(points: Point2D[], transportationClass: TransportationClass, config: ProjectConfigV1): Point2D[][] | undefined {
  if (transportationClass !== "major-road" || config.lineStyle.roadStyle !== "outlined") return undefined;
  const offsetMm = config.lineStyle.majorRoadSpacingMm / 2;
  return [offsetPolyline(points, -offsetMm), offsetPolyline(points, offsetMm)];
}

/** `centerline` is the already-clipped source path, reused whenever the style draws it as-is. */
function styledTransportationPaths(outlines: Point2D[][] | undefined, centerline: Point2D[][], polygons: PreparedPolygons, excludedPolygons?: PreparedPolygons): Point2D[][] {
  return outlines ? outlines.flatMap((outline) => clipPolyline(outline, polygons, excludedPolygons)) : centerline;
}

function fabricationLabel(value: string): string | undefined {
  const normalized = value.normalize("NFKD").replace(/\p{M}/gu, "").toUpperCase()
    .replace(/[^A-Z0-9 .:/_+·-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 48);
  return normalized || undefined;
}

function polylineLength(points: Point2D[]): number {
  return points.reduce((total, point, index) => {
    const next = points[index + 1];
    return total + (next ? Math.hypot(next.x - point.x, next.y - point.y) : 0);
  }, 0);
}

function longestPath(paths: Point2D[][]): number {
  let longest = Number.NEGATIVE_INFINITY;
  for (const path of paths) longest = Math.max(longest, polylineLength(path));
  return longest;
}

interface TransportationJunction { point: Point2D; arms: number; hasMajorRoad: boolean }

function transportationJunctions(features: MarkingFeature[]): TransportationJunction[] {
  const junctions = new Map<string, TransportationJunction>();
  for (const feature of features) {
    const transportationClass = feature.transportationClass ?? (feature.kind === "road" ? "local-road" : undefined);
    if (!transportationClass || transportationClass === "trail" || feature.points.length < 2) continue;
    // One road contributes at most one arm per place. Vector tiles quantize
    // coordinates, so a doubled vertex - or a loop returning to its own seam -
    // would otherwise reach three arms by itself and engrave a junction ring
    // where no roads cross.
    const counted = new Set<string>();
    feature.points.forEach((point, index) => {
      const key = `${Math.round(point.x * 10)},${Math.round(point.y * 10)}`;
      if (counted.has(key)) return;
      counted.add(key);
      const current = junctions.get(key) ?? { point, arms: 0, hasMajorRoad: false };
      current.arms += index === 0 || index === feature.points.length - 1 ? 1 : 2;
      current.hasMajorRoad ||= transportationClass === "major-road";
      junctions.set(key, current);
    });
  }
  return [...junctions.values()].filter((junction) => junction.arms >= 3 && junction.hasMajorRoad)
    .sort((left, right) => left.point.y - right.point.y || left.point.x - right.point.x);
}

function junctionRing(center: Point2D, radiusMm: number): Point2D[] {
  const points = Array.from({ length: 20 }, (_, index) => {
    const angle = index / 20 * Math.PI * 2;
    return { x: center.x + Math.cos(angle) * radiusMm, y: center.y + Math.sin(angle) * radiusMm };
  });
  return [...points, { ...points[0]! }];
}

/** Each layer's material and the material stacked above it, indexed once for routing many markings. */
interface LayerClip {
  layer: LayerIR;
  material: PreparedPolygons;
  covering: PreparedPolygons;
}

/** `upper` followed by `lower`, reusing both sets' ring bounds. */
function concatPrepared(upper: PreparedPolygons, lower: PreparedPolygons): PreparedPolygons {
  const { bounds: a } = upper;
  const { bounds: b } = lower;
  return {
    polygons: [...upper.polygons, ...lower.polygons],
    outerBounds: [...upper.outerBounds, ...lower.outerBounds],
    rings: [...upper.rings, ...lower.rings],
    bounds: { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) },
  };
}

/** Built top-down: each layer's covering is the layer above's material plus that layer's covering. */
function layerClips(layers: LayerIR[]): LayerClip[] {
  const clips: LayerClip[] = new Array(layers.length);
  let covering = preparePolygons([]);
  for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const layer = layers[layerIndex]!;
    const material = preparePolygons(layer.polygons);
    clips[layerIndex] = { layer, material, covering };
    covering = concatPrepared(material, covering);
  }
  return clips;
}

function addAlignmentGuides(config: ProjectConfigV1, clips: LayerClip[]): void {
  for (let index = 0; index < clips.length - 1; index += 1) {
    const layer = clips[index]?.layer;
    const material = clips[index]?.material;
    const nextLayer = clips[index + 1]?.layer;
    if (!layer || !material || !nextLayer || nextLayer.polygons.length === 0) continue;
    const layerNumber = String(layer.index + 1).padStart(2, "0");
    const nextLayerNumber = String(nextLayer.index + 1).padStart(2, "0");
    const labelIndex = indexLabelLayer(layer.polygons, layer.markings);
    nextLayer.polygons.forEach((polygon, polygonIndex) => {
      const guides: OperationPath[] = [];
      offsetClosedRing(polygon.outer, -config.laserKerfMm, "round").forEach((inset, insetIndex) => {
        clipPolyline(inset, material).forEach((points, clipIndex) => guides.push({
          id: `alignment-layer-${layerNumber}-to-${nextLayerNumber}-${polygonIndex}-inset-${insetIndex}-outline-${clipIndex}`,
          operation: "engrave",
          kind: "guide",
          points,
        }));
      });
      addLabelObstacles(labelIndex, guides);
      // After a work-area split the next layer is many pieces, so a repeated
      // "L03" on one sheet says nothing; name the piece that belongs here.
      const label = nextLayer.pieces[polygonIndex]?.id ?? `L${nextLayerNumber}`;
      const point = placeLabel(label, config, labelIndex, polygonCenter(polygon, config), [polygon]);
      if (point) {
        const guideLabel: OperationPath = { id: `alignment-layer-${layerNumber}-to-${nextLayerNumber}-${polygonIndex}-label`, operation: "engrave", kind: "guide", points: [point], label, textStyle: config.textStyle };
        guides.push(guideLabel);
        addLabelObstacles(labelIndex, [guideLabel]);
      }
      layer.markings.push(...guides);
    });
  }
}

/** The parts of `polygon` that something stacked above it hides after assembly. */
function coveredParts(polygon: Polygon2D, covering: PreparedPolygons): Polygon2D[] {
  if (!covering.polygons.length) return [];
  const box = ringBounds(polygon.outer);
  // Layer 0's covering is every layer above it, so filter before clipping.
  const near = covering.polygons.filter((_, index) => boundsOverlap(box, covering.outerBounds[index]!));
  if (!near.length) return [];
  return normalizeMultiPolygon(polygonClipping.intersection(
    [[toRing(polygon.outer), ...polygon.holes.map(toRing)]] as MultiPolygon,
    near.map((part) => [toRing(part.outer), ...part.holes.map(toRing)]) as MultiPolygon,
  ) as MultiPolygon);
}

/**
 * Engrave each cut piece's assembly id where the stack above hides it.
 *
 * A visible id would survive glue-up as a blemish, so a piece with no covered
 * room keeps none - which is also why the top layer and flat engravings get
 * none at all, their covering being empty. `placeLabel` already requires the
 * label box to sit inside both the layer's material and `requiredPolygons`,
 * so passing the covered sub-region is the whole "prefer covered" filter.
 */
function addPieceLabels({ config, flatEngraving, warnings }: GenerationContext, clips: LayerClip[]): void {
  // A flat artwork has nothing stacked over it - its "layers" are contour
  // lines on one face - so no id could ever be hidden. Its pieces are named
  // by panel filename instead.
  if (!config.showAssemblyLabels || flatEngraving) return;
  const omitted: string[] = [];
  for (const { layer, covering } of clips) {
    if (!layer.pieces.length) continue;
    const labelIndex = indexLabelLayer(layer.polygons, layer.markings);
    for (const piece of layer.pieces) {
      const polygon = layer.polygons[piece.polygonIndex];
      if (!polygon) continue;
      const covered = coveredParts(polygon, covering);
      const point = covered.length
        ? placeLabel(piece.id, config, labelIndex, polygonCenter(polygon, config), covered)
        : undefined;
      if (!point) {
        omitted.push(piece.id);
        continue;
      }
      const marking: OperationPath = {
        id: `piece-${piece.id}-label`,
        operation: "engrave",
        kind: "guide",
        points: [point],
        label: piece.id,
        textStyle: config.textStyle,
      };
      layer.markings.push(marking);
      addLabelObstacles(labelIndex, [marking]);
    }
  }
  if (omitted.length) warnings.push({
    code: "LABEL_OMITTED",
    message: `Assembly ids were omitted from ${omitted.length} piece${omitted.length === 1 ? "" : "s"} (${omitted.slice(0, 4).join(", ")}) because no position stayed hidden under the layer above.`,
  });
}

function stableProjectValue(config: ProjectConfigV1): unknown {
  const { explodedPreview: _previewOnly, name: _packageMetadata, ...fabricationConfig } = config;
  return {
    ...fabricationConfig,
    location: { ...config.location, bounds: config.location.bounds ? { ...config.location.bounds } : undefined },
  };
}

// Canonical JSON: object keys sorted recursively so value-identical configs
// hash identically regardless of key insertion order.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function projectFingerprint(config: ProjectConfigV1): string {
  const input = stableStringify(stableProjectValue(config));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v9-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** East-west ground distance across the bounds, measured along their middle latitude. */
function groundWidthMFor(bounds: GeoBounds): number {
  const radians = Math.PI / 180;
  return Math.abs((bounds.east - bounds.west) * radians) * 6_371_008.8 * Math.cos(((bounds.north + bounds.south) / 2) * radians);
}

/**
 * Resolve a config and its terrain relief into physical stack dimensions.
 *
 * The model's horizontal scale already exists — `widthMm` over the ground width
 * of the mapped bounds — so the true-scale height of the relief is a fact, not
 * a preference. Exaggeration multiplies that height, and the material thickness
 * divides it into sheets. Layer count is therefore always the last term.
 *
 * The sheet count is rounded to whole sheets, with a two-sheet minimum and no
 * upper cap. The exaggeration is refitted to that whole-sheet count, so the
 * reported figure always describes the model that will actually be cut. The
 * refitted value can fall below `MIN_VERTICAL_EXAGGERATION` or rise above
 * `MAX_VERTICAL_EXAGGERATION`; those bounds constrain the request, not the fit.
 */
/** Model millimeters per ground millimeter across the mapped width; 0 when the bounds have no usable width. */
export function horizontalScaleFor(widthMm: number, bounds: GeoBounds): number {
  const groundWidthM = groundWidthMFor(bounds);
  return Number.isFinite(groundWidthM) && groundWidthM > 0 ? widthMm / (groundWidthM * 1000) : 0;
}

export function planTerrainStack(config: ProjectConfigV1, reliefM: number, bounds: GeoBounds, depthBelowLandM = 0): TerrainStackPlan {
  const requested = config.verticalExaggeration;
  const groundWidthM = groundWidthMFor(bounds);
  const flat = {
    layerCount: MIN_LAYER_COUNT,
    depthLayerCount: 0,
    verticalExaggeration: requested,
    stackHeightMm: MIN_LAYER_COUNT * config.materialThicknessMm,
    metersPerLayer: Math.max(0, reliefM) / MIN_LAYER_COUNT,
    horizontalScale: 0,
  };
  if (!Number.isFinite(groundWidthM) || groundWidthM <= 0 || !Number.isFinite(reliefM) || reliefM < 0) return flat;

  const horizontalScale = config.widthMm / (groundWidthM * 1000);
  const hasDepth = Number.isFinite(depthBelowLandM) && depthBelowLandM > 0;
  if (reliefM === 0) {
    if (!hasDepth) return flat;
    // A flat shoreline still has a physical depth scale. Include a top sheet
    // at the waterline as well as the layers covering the bed below it.
    const metersPerLayer = config.materialThicknessMm / (horizontalScale * 1000 * requested);
    const depthLayerCount = Math.min(config.waterDepthLayerLimit ?? Infinity, Math.ceil(depthBelowLandM / metersPerLayer));
    const layerCount = Math.max(MIN_LAYER_COUNT, depthLayerCount + 1);
    return { layerCount, depthLayerCount, metersPerLayer, horizontalScale, verticalExaggeration: requested, stackHeightMm: layerCount * config.materialThicknessMm };
  }
  const trueReliefMm = reliefM * (config.widthMm / groundWidthM);
  if (!(trueReliefMm > 0)) return { ...flat, horizontalScale };

  const landLayerCount = Math.max(MIN_LAYER_COUNT, Math.round((trueReliefMm * requested) / config.materialThicknessMm));
  const depthLimit = config.waterDepthLayerLimit ?? Infinity;
  const requiredDepthLayers = (landLayers: number): number => hasDepth
    ? Math.min(depthLimit, Math.ceil(depthBelowLandM / (reliefM / landLayers)))
    : 0;
  // Water adds sheets at the same interval without compressing the land.
  const metersPerLayer = reliefM / landLayerCount;
  const depthLayerCount = requiredDepthLayers(landLayerCount);
  const layerCount = landLayerCount + depthLayerCount;
  return {
    layerCount,
    depthLayerCount,
    // The refit describes the land, which is the part a reader judges the
    // exaggeration by; depth sheets ride along at the same scale.
    verticalExaggeration: (landLayerCount * config.materialThicknessMm) / trueReliefMm,
    stackHeightMm: layerCount * config.materialThicknessMm,
    metersPerLayer,
    horizontalScale,
  };
}

function niceScaleDistance(maximumM: number): number {
  if (!(maximumM > 0)) return 0;
  const power = 10 ** Math.floor(Math.log10(maximumM));
  return [5, 2, 1].map((factor) => factor * power).find((value) => value <= maximumM) ?? power;
}

function scaleMarking(maximumM: number, units: ProjectConfigV1["units"]): { distanceM: number; label: string } {
  if (units === "metric") {
    const distanceM = niceScaleDistance(maximumM);
    return { distanceM, label: distanceM >= 1000 ? `${Number((distanceM / 1000).toFixed(1))} km` : `${Math.round(distanceM)} m` };
  }
  const maximumFeet = maximumM * FEET_PER_METER;
  if (maximumFeet >= 2640) {
    const miles = niceScaleDistance(maximumFeet / 5280);
    return { distanceM: miles * 5280 / FEET_PER_METER, label: `${Number(miles.toFixed(1))} mi` };
  }
  const feet = niceScaleDistance(maximumFeet);
  return { distanceM: feet / FEET_PER_METER, label: `${Math.round(feet)} ft` };
}

function removeTinyRing(points: Point2D[], minimumFeatureMm: number): boolean {
  if (points.length < 4) return true;
  const bounds = ringBounds(points);
  return bounds.maxX - bounds.minX < minimumFeatureMm || bounds.maxY - bounds.minY < minimumFeatureMm;
}

// Douglas–Peucker: keeps every vertex that deviates from the simplified shape
// by more than tolerance. The previous distance-bucket thinning kept collinear
// stair-step vertices while dropping genuine curvature, which read as chunky.
function simplify(points: Point2D[], tolerance: number): Point2D[] {
  if (points.length <= 5 || tolerance <= 0) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDistance = tolerance;
    let maxIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const distance = distanceToSegment(points[index]!, points[start]!, points[end]!);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }
    if (maxIndex > 0) {
      keep[maxIndex] = 1;
      stack.push([start, maxIndex], [maxIndex, end]);
    }
  }
  return close(points.filter((_, index) => keep[index] === 1));
}

// Replace only visibly sharp turns with a short quadratic arc. Both smoothing
// modes begin with the same simplified iso-line; the enabled mode therefore
// changes corner shape rather than exposing more source-grid detail. Limiting
// the trim to one grid cell prevents broad terrain features from shrinking.
function roundContourRing(ring: Pair[], maximumTrimMm: number): Pair[] {
  if (ring.length < 5) return ring;
  const open = ring.slice(0, -1);
  const rounded: Ring = [];
  for (let index = 0; index < open.length; index += 1) {
    const previous = open[(index - 1 + open.length) % open.length]!;
    const current = open[index]!;
    const next = open[(index + 1) % open.length]!;
    const incomingX = current[0] - previous[0];
    const incomingY = current[1] - previous[1];
    const outgoingX = next[0] - current[0];
    const outgoingY = next[1] - current[1];
    const incomingLength = Math.hypot(incomingX, incomingY);
    const outgoingLength = Math.hypot(outgoingX, outgoingY);
    if (incomingLength <= 1e-9 || outgoingLength <= 1e-9) {
      rounded.push([current[0], current[1]]);
      continue;
    }
    const dot = clamp((incomingX * outgoingX + incomingY * outgoingY) / (incomingLength * outgoingLength), -1, 1);
    if (Math.acos(dot) < Math.PI / 15) {
      rounded.push([current[0], current[1]]);
      continue;
    }
    const trim = Math.min(maximumTrimMm, incomingLength * 0.4, outgoingLength * 0.4);
    const start: Pair = [current[0] - incomingX * trim / incomingLength, current[1] - incomingY * trim / incomingLength];
    const end: Pair = [current[0] + outgoingX * trim / outgoingLength, current[1] + outgoingY * trim / outgoingLength];
    rounded.push(
      start,
      [start[0] * 0.25 + current[0] * 0.5 + end[0] * 0.25, start[1] * 0.25 + current[1] * 0.5 + end[1] * 0.25],
      end,
    );
  }
  rounded.push([rounded[0]![0], rounded[0]![1]]);
  return rounded;
}

// d3-contour emits ring coordinates in cell space where sample (i, j) sits at
// (i + 0.5, j + 0.5); map samples 0..n-1 onto the full material span so the
// forward mapping stays the exact inverse of sampleElevation.
function contourToMm(point: [number, number], grid: ElevationGrid, config: ProjectConfigV1): Point2D {
  return {
    x: sampleOffset(point[0] - 0.5, grid.width, config.widthMm),
    y: sampleOffset(point[1] - 0.5, grid.height, config.heightMm),
  };
}

/** Pass `simplificationTolerance` 0 for rings already simplified, or simplifying again flattens their rounded corners. */
function clipContours(raw: MultiPolygon, clip: Point2D[], minimumFeatureMm: number, simplificationTolerance = minimumFeatureMm * CONTOUR_SIMPLIFICATION_FACTOR): Polygon2D[] {
  return normalizeMultiPolygon(polygonClipping.intersection(raw, [[toRing(clip)]]) as MultiPolygon, (ring) => {
    const refined = simplify(ring, simplificationTolerance);
    return removeTinyRing(refined, minimumFeatureMm) ? undefined : refined;
  });
}

function sampleElevation(grid: ElevationGrid, point: Point2D, config: ProjectConfigV1): number {
  const gridX = clamp(Math.round(sampleIndexAt(point.x, grid.width, config.widthMm)), 0, grid.width - 1);
  const gridY = clamp(Math.round(sampleIndexAt(point.y, grid.height, config.heightMm)), 0, grid.height - 1);
  return grid.values[gridY * grid.width + gridX] ?? grid.min;
}

function layerForElevation(elevation: number, thresholds: number[]): number {
  let layer = 0;
  for (let index = 1; index < thresholds.length; index += 1) {
    if (elevation >= (thresholds[index] ?? Number.POSITIVE_INFINITY)) layer = index;
  }
  return layer;
}

function isClosedWater(feature: MarkingFeature): boolean {
  return feature.kind === "water" && feature.points.length > 3 && Math.hypot(feature.points[0]!.x - feature.points.at(-1)!.x, feature.points[0]!.y - feature.points.at(-1)!.y) <= 1e-6;
}

function splitMarking(feature: MarkingFeature, thresholds: number[], grid: ElevationGrid, config: ProjectConfigV1): Array<{ layer: number; points: Point2D[] }> {
  if (isClosedWater(feature)) {
    const elevations = feature.points.slice(0, -1).map((point) => feature.elevationM ?? sampleElevation(grid, point, config)).sort((left, right) => left - right);
    const middle = Math.floor(elevations.length / 2);
    const elevation = elevations.length % 2 === 0 ? ((elevations[middle - 1] ?? grid.min) + (elevations[middle] ?? grid.min)) / 2 : (elevations[middle] ?? grid.min);
    return [{ layer: layerForElevation(elevation, thresholds), points: feature.points }];
  }
  const result: Array<{ layer: number; points: Point2D[] }> = [];
  // A single-point feature (e.g. a point label) still belongs to a layer even
  // though it produces no drawable segment.
  const minimumRun = feature.points.length === 1 ? 1 : 2;
  let activeLayer = -1;
  let active: Point2D[] = [];
  for (const point of feature.points) {
    const elevation = feature.elevationM ?? sampleElevation(grid, point, config);
    const layer = layerForElevation(elevation, thresholds);
    if (layer !== activeLayer) {
      if (active.length >= minimumRun && activeLayer >= 0) result.push({ layer: activeLayer, points: active });
      activeLayer = layer;
      active = active.length ? [active[active.length - 1]!, point] : [point];
    } else {
      active.push(point);
    }
  }
  if (active.length >= minimumRun && activeLayer >= 0) result.push({ layer: activeLayer, points: active });
  return result;
}

/** A readable, area-sensitive graticule interval chosen from 1/2/5 degree steps. */
export function coordinateGridInterval(bounds: GeoBounds): number {
  const target = Math.max(bounds.east - bounds.west, bounds.north - bounds.south) / 8;
  if (!(target > 0) || !Number.isFinite(target)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  for (const multiplier of [1, 2, 5, 10]) {
    const candidate = magnitude * multiplier;
    if (candidate >= target - 1e-12) return candidate;
  }
  return magnitude * 10;
}

function coordinateGridValues(minimum: number, maximum: number, interval: number): number[] {
  const epsilon = interval * 1e-7;
  const values: number[] = [];
  for (let value = Math.ceil((minimum + epsilon) / interval) * interval; value < maximum - epsilon && values.length < 1000; value += interval) {
    values.push(Math.abs(value) < epsilon ? 0 : Number(value.toFixed(10)));
  }
  return values;
}

function coordinateGridMarkings(config: ProjectConfigV1, bounds: GeoBounds, grid: ElevationGrid): MarkingFeature[] {
  const interval = coordinateGridInterval(bounds);
  const longitudeSamples = Math.max(2, Math.min(256, grid.height));
  const latitudeSamples = Math.max(2, Math.min(256, grid.width));
  const northY = mercatorWorldY(bounds.north);
  const southY = mercatorWorldY(bounds.south);
  const markings: MarkingFeature[] = [];
  coordinateGridValues(bounds.west, bounds.east, interval).forEach((longitude) => {
    const x = ((longitude - bounds.west) / (bounds.east - bounds.west) - 0.5) * config.widthMm;
    markings.push({
      id: `coordinate-longitude-${Math.round(longitude * 1e7)}`,
      kind: "grid",
      operation: "engrave",
      points: Array.from({ length: longitudeSamples }, (_, index) => ({ x, y: (index / (longitudeSamples - 1) - 0.5) * config.heightMm })),
    });
  });
  coordinateGridValues(bounds.south, bounds.north, interval).forEach((latitude) => {
    const y = ((mercatorWorldY(latitude) - northY) / (southY - northY) - 0.5) * config.heightMm;
    markings.push({
      id: `coordinate-latitude-${Math.round(latitude * 1e7)}`,
      kind: "grid",
      operation: "engrave",
      points: Array.from({ length: latitudeSamples }, (_, index) => ({ x: (index / (latitudeSamples - 1) - 0.5) * config.widthMm, y })),
    });
  });
  return markings;
}

function waterPatternAreasFromShorelines(markings: MarkingFeature[]): Polygon2D[] {
  const grouped = new Map<string, Map<number, Point2D[]>>();
  for (const marking of markings) {
    const match = marking.kind === "water" ? marking.id.match(/^(.*water-area-[^-]+)-shore-(\d+)/) : undefined;
    if (!match || marking.points.length < 4) continue;
    const rings = grouped.get(match[1]!) ?? new Map<number, Point2D[]>();
    rings.set(Number(match[2]), marking.points);
    grouped.set(match[1]!, rings);
  }
  return [...grouped.values()].flatMap((rings) => {
    const outer = rings.get(0);
    return outer ? [{ outer, holes: [...rings.entries()].filter(([index]) => index > 0).sort(([left], [right]) => left - right).map(([, points]) => points) }] : [];
  });
}

/**
 * Validate a grid and return it with extrema taken from its samples. Declared
 * `min`/`max` are only trusted when they agree with the data to Float32
 * precision: a provider that reports its no-data sentinel (-32768) as the
 * minimum would otherwise stretch the ladder across 33 km of empty relief.
 */
function measuredElevationGrid(grid: ElevationGrid): ElevationGrid {
  if (grid.values.length !== grid.width * grid.height) throw new Error("Elevation grid dimensions do not match its values.");
  if (!Number.isInteger(grid.width) || !Number.isInteger(grid.height) || grid.width < 2 || grid.height < 2 || !Number.isFinite(grid.min) || !Number.isFinite(grid.max) || grid.max < grid.min) throw new Error("Elevation grid metadata is invalid.");
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of grid.values) {
    if (!Number.isFinite(value)) throw new Error("Elevation grid contains non-finite values.");
    if (value < min) min = value;
    if (value > max) max = value;
  }
  // Float32 storage rounds by at most one part in ~2^24; keep the caller's
  // more precise figure when it describes the same extreme.
  const agrees = (declared: number, measured: number) => Math.abs(declared - measured) <= Math.max(1e-3, Math.abs(measured) * 1e-6);
  const trustedMin = agrees(grid.min, min) ? grid.min : min;
  const trustedMax = agrees(grid.max, max) ? grid.max : max;
  return trustedMin === grid.min && trustedMax === grid.max ? grid : { ...grid, min: trustedMin, max: trustedMax };
}

/** Inputs and accumulators shared by every generation phase. */
interface GenerationContext {
  config: ProjectConfigV1;
  source: SourceBundleV1;
  flatEngraving: boolean;
  /** Stack-only: flat engravings ignore water depth entirely. */
  usesWaterDepth: boolean;
  /** Closed crop outline in artwork millimeters. */
  clip: Point2D[];
  warnings: GeometryWarning[];
}

/** The elevation ladder every layer is contoured from, plus the grid it is cut from. */
interface ElevationLadder {
  landMin: number;
  landMax: number;
  visibleMin: number;
  visibleMax: number;
  depthBelowLandM: number;
  stack: TerrainStackPlan;
  ladderBase: number;
  /** Layer base elevations; trimmed when empty circular caps are dropped. */
  thresholds: number[];
  /** Carved water after any fit to the ladder floor. */
  water: CarvedWater;
  /** The carved, fitted, and floor-clamped grid actually contoured. */
  modelGrid: ElevationGrid;
}

interface TransportationLabelCandidate {
  layer: LayerIR;
  paths: Point2D[][];
  transportationClass: TransportationClass;
  excludedPolygons: Polygon2D[];
}

/** Every visible clipped run of each distinct road or trail name. */
type TransportationLabelCandidates = Map<string, TransportationLabelCandidate[]>;

function addSourceWarnings({ config, source, usesWaterDepth, warnings }: GenerationContext): void {
  if (source.terrainSourceUnavailable) warnings.push({
    code: "TERRAIN_SOURCE_FALLBACK",
    message: "Higher-resolution terrain is unavailable for this area. The map uses the standard elevation source instead.",
  });
  if ((source.elevationRepairCount ?? 0) > 0) warnings.push({
    code: "ELEVATION_REPAIRED",
    message: "Isolated depth spikes in the elevation data were replaced with estimates from nearby terrain. Review the terrain before cutting.",
  });
  const wantsVectorData = sourceRequirements(config).vectors;
  if (source.vectorStatus === "partial" && wantsVectorData) warnings.push({
    code: "VECTOR_DATA_PARTIAL",
    message: "The map detail feature limit was reached, so some roads, trails, water lines, or boundaries may be missing.",
  });
  if (source.vectorStatus === "unavailable" && wantsVectorData) warnings.push({
    code: "VECTOR_DATA_UNAVAILABLE",
    message: "Map detail data is unavailable. This project cannot be exported until the map data is restored or those details are disabled.",
  });
  if (source.lakeDataStatus === "unavailable" && usesWaterDepth) warnings.push({
    code: "LAKE_DATA_UNAVAILABLE",
    message: "Lake depth data is unavailable. Disable water depth or regenerate after the service is restored before exporting.",
  });
  if ((source.bathymetryStatus === "unavailable" || source.bathymetryStatus === "partial") && usesWaterDepth) warnings.push({
    code: "BATHYMETRY_FALLBACK",
    message: "Some surveyed lake-floor data is unavailable. Gaps use existing terrain or modeled basins instead.",
  });
}

/**
 * Carve modeled lake beds into the grid before anything reads it. Everything
 * downstream then produces the recess on its own: the contour rings become
 * holes, and holes are already honoured by clipping, nesting, and labelling.
 */
function carveWater(context: GenerationContext, grid: ElevationGrid): { waterAreas: WaterAreaV1[]; carved: CarvedWater } {
  const { config, source } = context;
  const waterAreas: WaterAreaV1[] = context.usesWaterDepth
    ? (source.waterAreas ?? []).map((area) => {
        const override = area.hylakId === undefined ? undefined : config.waterDepthOverrides[String(area.hylakId)];
        return override && override > 0 ? { ...area, maxDepthM: override, depthSource: "user" as const } : area;
      })
    : [];
  const groundWidthM = groundWidthMFor(source.bounds);
  const radians = Math.PI / 180;
  // Mercator world Y runs north-to-south over [0, 1] of a 2*pi world, so the
  // bounds' projected height is that span read back off the shared projection.
  const mercatorHeight = 2 * Math.PI * (mercatorWorldY(source.bounds.south) - mercatorWorldY(source.bounds.north));
  const groundHeightM = groundWidthM * mercatorHeight / ((source.bounds.east - source.bounds.west) * radians);
  const carved = carveWaterDepth(grid, config, waterAreas, groundWidthM, groundHeightM);
  context.warnings.push(...carved.warnings);
  return { waterAreas, carved };
}

function buildLadder(context: GenerationContext, carved: CarvedWater, waterAreas: WaterAreaV1[]): ElevationLadder {
  const { config, source, flatEngraving, warnings } = context;
  // Size the stack from land alone. A coastal map's grid minimum is the abyssal
  // plain, and dividing the whole of that across the sheet budget is what used
  // to squeeze the land into a layer or two.
  const { landMin, landMax, min: visibleMin, max: visibleMax } = cropElevationRange(config, carved.grid, carved.waterMask);
  const landRelief = landMax - landMin;
  const depthBelowLandM = Math.max(0, landMin - (Number.isFinite(visibleMin) ? visibleMin : carved.grid.min));
  if (landRelief < 20) warnings.push({ code: "LOW_RELIEF", message: flatEngraving ? "This area has very little elevation change; contour lines may be sparse." : "This area has very little elevation change; the layers may look nearly identical." });

  const hasOcean = !flatEngraving && waterAreas.some((area) => area.kind === "ocean");
  const stack = planTerrainStack(config, landRelief, source.bounds, depthBelowLandM);

  // The ladder runs at one uniform step, extended below the land minimum by the
  // depth sheets the budget allowed. When there is an ocean it is shifted so sea
  // level falls exactly on a step, which is what makes a coastline cut as a
  // clean sheet edge instead of a ragged one.
  let ladderBase = flatEngraving ? landMin : landMin - stack.depthLayerCount * stack.metersPerLayer;
  if (hasOcean && stack.metersPerLayer > 0) {
    ladderBase = SEA_LEVEL_M - Math.ceil((SEA_LEVEL_M - ladderBase) / stack.metersPerLayer) * stack.metersPerLayer;
  }
  // Snapping to sea level slides the whole ladder down by up to a full step, so
  // the sheet count is taken from the span the ladder actually has to cover.
  // Keeping the planned count instead would drop the summit off the top. The
  // step itself is unchanged, so the planned exaggeration still describes the cut.
  // A flat engraving of flat ground has no contours to draw: every threshold
  // would coincide and repeat the crop outline, so only the base remains.
  const ladderLayerCount = flatEngraving
    ? landRelief > 0 ? config.engravingContourCount + 1 : 1
    : stack.metersPerLayer > 0
      ? Math.max(MIN_LAYER_COUNT, Math.ceil((landMax - ladderBase) / stack.metersPerLayer - 1e-9) + (landRelief === 0 ? 1 : 0))
      : stack.layerCount;
  const contourStepM = flatEngraving ? landRelief / (config.engravingContourCount + 1) : stack.metersPerLayer;
  const thresholds = Array.from({ length: ladderLayerCount }, (_, index) => ladderBase + contourStepM * index);

  // Water deeper than the ladder reaches is flattened at its floor rather than
  // silently punching through the base sheet.
  const water = config.fitLakeDepth && !flatEngraving ? fitLakesToLadder(carved, config, ladderBase) : carved;
  const { grid: modelGrid, clamped } = clampCarveToLadder(water.grid, ladderBase);
  if (clamped && !flatEngraving) warnings.push({
    code: "WATER_DEPTH_CLAMPED",
    ...(!config.fitLakeDepth && carved.surfaces.some((surface) => surface.kind === "lake" && surface.bedElevationM < ladderBase && surface.surfaceElevationM > ladderBase) ? { action: "fit-lake-depth" as const } : {}),
    message: `Water here is deeper than the ${stack.depthLayerCount} sheet${stack.depthLayerCount === 1 ? "" : "s"} below the shoreline can hold, so its floor is flattened. Increase the depth-layer limit or turn it off for automatic coverage. Fit depth compresses lakes to the chosen allowance.`,
  });
  return { landMin, landMax, visibleMin, visibleMax, depthBelowLandM, stack, ladderBase, thresholds, water, modelGrid };
}

function contourLayers({ config, flatEngraving, clip, warnings }: GenerationContext, ladder: ElevationLadder): LayerIR[] {
  const { modelGrid, thresholds } = ladder;
  // Grid-edge interpolation keeps threshold locations accurate; the user-facing
  // smoothing option is applied separately to the resulting geometry below.
  const contourGenerator = contours().size([modelGrid.width, modelGrid.height]).smooth(true).thresholds(thresholds.slice(1));
  const maximumCornerTrimMm = Math.max(config.widthMm / (modelGrid.width - 1), config.heightMm / (modelGrid.height - 1));
  const generated = contourGenerator(Array.from(modelGrid.values));

  const layers: LayerIR[] = [{
    id: "layer-01",
    index: 0,
    elevationM: thresholds[0] ?? modelGrid.min,
    materialThicknessMm: config.materialThicknessMm,
    polygons: [{ outer: clip, holes: [] }],
    markings: [],
    pieces: [],
  }];

  generated.forEach((contour, generatedIndex) => {
    const raw: MultiPolygon = contour.coordinates.map((polygon) => polygon.map((ring) => {
      const mapped: Ring = ring.map((point) => {
        const point2d = contourToMm([point[0] ?? 0, point[1] ?? 0], modelGrid, config);
        return [point2d.x, point2d.y] as Pair;
      });
      const baseline = simplify(close(mapped.map(toPoint)), config.minimumFeatureMm * CONTOUR_SIMPLIFICATION_FACTOR)
        .map(({ x, y }) => [x, y] as Pair);
      return config.smoothing > 0 ? roundContourRing(baseline, maximumCornerTrimMm) : baseline;
    }));
    const polygons = clipContours(raw, clip, config.minimumFeatureMm, 0);
    const index = generatedIndex + 1;
    layers.push({
      id: `layer-${String(index + 1).padStart(2, "0")}`,
      index,
      elevationM: thresholds[index] ?? modelGrid.max,
      materialThicknessMm: config.materialThicknessMm,
      polygons,
      markings: [],
      pieces: [],
    });
  });

  // A circular clip can retain only an unprintably small edge of an outside
  // summit. Drop empty caps, but keep any interior gaps as export-blocking errors.
  let omittedCaps = 0;
  if (config.cropShape === "circle") {
    while (layers.length > 1 && layers.at(-1)!.polygons.length === 0) { layers.pop(); omittedCaps += 1; }
    if (omittedCaps) {
      thresholds.length = layers.length;
      const unit = flatEngraving ? "contour" : "sheet";
      warnings.push({ code: "SMALL_FEATURES", message: `${omittedCaps} upper ${unit}${omittedCaps === 1 ? " was" : "s were"} omitted because the circular crop retained no material meeting the minimum feature size.` });
    }
  }

  for (const layer of layers) {
    if (!layer.polygons.length) warnings.push({ code: "EMPTY_LAYER", message: `Layer ${layer.index + 1} has no printable terrain at its elevation.` });
  }
  return layers;
}

function clipToCrop(polygon: Polygon2D, clip: Point2D[], minimumFeatureMm: number): Polygon2D[] {
  return clipContours([[toRing(polygon.outer), ...polygon.holes.map(toRing)]] as MultiPolygon, clip, minimumFeatureMm);
}

function waterOutputs({ config, source, flatEngraving, clip, warnings }: GenerationContext, ladder: ElevationLadder): { waterSurfaces: WaterSurfaceIR[]; waterPatternAreas: Polygon2D[] } {
  // Surfaces are virtual - never cut, only drawn - so they are clipped to the
  // crop here and carried on the IR for the previews to float over the basin.
  const waterSurfaces: WaterSurfaceIR[] = ladder.water.surfaces.flatMap((surface) => {
    const polygons = surface.polygons.flatMap((polygon) => clipToCrop(polygon, clip, config.minimumFeatureMm));
    if (!polygons.length) return [];
    return [{ ...surface, polygons, layerIndex: layerForElevation(surface.surfaceElevationM, ladder.thresholds) }];
  });

  // Report provenance for lakes actually included in the output. A user-set
  // maximum or partial survey does not make the rest of a lake floor measured.
  if (waterSurfaces.some((surface) => surface.kind === "lake" && surface.depthSource !== "surveyed")) warnings.push({
    code: "LAKE_DEPTH_PREDICTED",
    message: "Some lake depths are estimated rather than surveyed. Modeled lake floors may differ from the actual underwater terrain.",
  });

  const waterPatternAreas = flatEngraving && config.showWater && config.waterFillPattern !== "none"
    ? (source.waterPatternAreas ?? source.waterAreas?.map((area) => area.polygon) ?? waterPatternAreasFromShorelines(source.markings))
        .flatMap((polygon) => clipToCrop(polygon, clip, config.minimumFeatureMm))
    : [];
  return { waterSurfaces, waterPatternAreas };
}

function transportationClassOf(feature: MarkingFeature): TransportationClass | undefined {
  return feature.transportationClass ?? (feature.kind === "trail" ? "trail" : feature.kind === "road" ? "local-road" : undefined);
}

function markingEnabled(feature: MarkingFeature, config: ProjectConfigV1): boolean {
  const transportationClass = transportationClassOf(feature);
  return feature.id.startsWith("custom-data-line-") ||
    (transportationClass === "trail" && config.showTrails) ||
    (transportationClass !== undefined && transportationClass !== "trail" && config.showRoads) ||
    (feature.kind === "water" && config.showWater) ||
    (feature.kind === "boundary" && config.showBoundaries) ||
    (feature.kind === "grid" && config.showCoordinateGrid) ||
    feature.kind === "contour" || feature.kind === "label" || feature.kind === "guide";
}

/** Source, custom, and graticule features with their ids made unique among repeated source ids. */
function mapFeatures({ config, source }: GenerationContext, modelGrid: ElevationGrid): Array<{ feature: MarkingFeature; featureId: string }> {
  const customLineMarkings: MarkingFeature[] = config.customLines.map((line, index) => ({
    id: `custom-data-line-${index}`,
    kind: line.kind,
    operation: "engrave",
    points: line.points.map((point) => geoPointToMapPoint(point.lat, point.lon, source.bounds, config.widthMm, config.heightMm)),
    ...(line.kind === "trail" ? { transportationClass: "trail" as const } : {}),
  }));
  const mapMarkings = [
    ...source.markings,
    ...customLineMarkings,
    ...(config.showCoordinateGrid ? coordinateGridMarkings(config, source.bounds, modelGrid) : []),
  ];
  const sourceIdCounts = new Map<string, number>();
  mapMarkings.forEach((feature) => sourceIdCounts.set(feature.id, (sourceIdCounts.get(feature.id) ?? 0) + 1));
  const sourceIdOccurrences = new Map<string, number>();
  return mapMarkings.map((feature) => {
    const sourceOccurrence = sourceIdOccurrences.get(feature.id) ?? 0;
    sourceIdOccurrences.set(feature.id, sourceOccurrence + 1);
    return { feature, featureId: (sourceIdCounts.get(feature.id) ?? 0) > 1 ? `${feature.id}-source-${sourceOccurrence}` : feature.id };
  });
}

function addTransportationLabelCandidate(labels: TransportationLabelCandidates, label: string, candidate: TransportationLabelCandidate): void {
  const candidates = labels.get(label);
  if (candidates) candidates.push(candidate);
  else labels.set(label, [candidate]);
}

/** A flat engraving has one physical face, so every feature is clipped to the crop once. */
function routeFlatMarking(config: ProjectConfigV1, feature: MarkingFeature, featureId: string, base: LayerClip, labels: TransportationLabelCandidates): void {
  const { layer: baseLayer, material: baseMaterial } = base;
  const transportationClass = transportationClassOf(feature);
  if (transportationClass) {
    const clipped = clipPolyline(feature.points, baseMaterial);
    styledTransportationPaths(transportationOutlines(feature.points, transportationClass, config), clipped, baseMaterial).forEach((points, styleIndex) => baseLayer.markings.push({
      id: `${featureId}-flat-transport-${styleIndex}`,
      operation: "engrave",
      kind: transportationClass === "trail" ? "trail" : "road",
      transportationClass,
      points,
    }));
    const label = feature.label && config.showTransportationLabels ? fabricationLabel(feature.label) : undefined;
    if (label && clipped.length) addTransportationLabelCandidate(labels, label, { layer: baseLayer, paths: clipped, transportationClass, excludedPolygons: [] });
    return;
  }
  if (feature.label && feature.points[0] && pointInPreparedPolygons(feature.points[0], baseMaterial)) {
    baseLayer.markings.push({ id: `${featureId}-flat-label`, operation: feature.operation, kind: feature.kind, points: [feature.points[0]], label: feature.label, textStyle: config.textStyle });
  }
  clipPolyline(feature.points, baseMaterial)
    .filter((points) => feature.kind !== "water" || polylineLength(points) >= config.minimumFeatureMm)
    .forEach((points, clipIndex) => baseLayer.markings.push({ id: `${featureId}-flat-${clipIndex}`, operation: feature.operation, kind: feature.kind, points }));
}

function routeStackMarking(config: ProjectConfigV1, feature: MarkingFeature, featureId: string, clips: LayerClip[], ladder: ElevationLadder, labels: TransportationLabelCandidates): void {
  const layers = clips.map(({ layer }) => layer);
  const transportationClass = transportationClassOf(feature);
  if (transportationClass) {
    const outlines = transportationOutlines(feature.points, transportationClass, config);
    const label = feature.label && config.showTransportationLabels ? fabricationLabel(feature.label) : undefined;
    clips.forEach(({ layer, material, covering }) => {
      const clipped = clipPolyline(feature.points, material, covering);
      styledTransportationPaths(outlines, clipped, material, covering).forEach((points, styleIndex) => layer.markings.push({
        id: `${featureId}-${layer.index}-transport-${styleIndex}`,
        operation: "engrave",
        kind: transportationClass === "trail" ? "trail" : "road",
        transportationClass,
        points,
      }));
      if (label && clipped.length) addTransportationLabelCandidate(labels, label, { layer, paths: clipped, transportationClass, excludedPolygons: covering.polygons });
    });
    return;
  }
  // Terrain boundaries, grids, and open waterways follow every exposed layer.
  // Assigning them from elevations sampled only at their source vertices can
  // skip every intermediate layer when a coarse segment crosses a contour,
  // leaving the score line visibly short of the step edge. Clipping the full
  // path against each exposed layer footprint makes adjacent pieces meet at
  // the exact contour intersection, independent of source vertex spacing.
  if ((feature.kind === "boundary" || feature.kind === "grid" || (feature.kind === "water" && !isClosedWater(feature))) && feature.elevationM === undefined) {
    clips.forEach(({ layer, material, covering }) => {
      clipPolyline(feature.points, material, covering).forEach((points, clipIndex) => layer.markings.push({
        id: `${featureId}-${layer.index}-terrain-${clipIndex}`,
        operation: feature.operation,
        kind: feature.kind,
        points,
      }));
    });
    // Keep the existing elevation-based label behavior while the line itself
    // follows the exact layer contours. Explicit-elevation water features use
    // the legacy path below because they intentionally belong to one plane.
    if (feature.label) {
      for (const [segmentIndex, segment] of splitMarking(feature, ladder.thresholds, ladder.modelGrid, config).entries()) {
        const layer = layers[segment.layer];
        if (layer && segment.points[0] && pointInPreparedPolygons(segment.points[0], clips[segment.layer]!.material)) {
          layer.markings.push({ id: `${featureId}-${layer.index}-${segmentIndex}-label`, operation: feature.operation, kind: feature.kind, points: [segment.points[0]], label: feature.label, textStyle: config.textStyle });
        }
      }
    }
    return;
  }
  for (const [segmentIndex, segment] of splitMarking(feature, ladder.thresholds, ladder.modelGrid, config).entries()) {
    const layer = layers[segment.layer];
    if (!layer) continue;
    const material = clips[segment.layer]!.material;
    const clipped = clipPolyline(segment.points, material);
    if (feature.label && segment.points[0] && pointInPreparedPolygons(segment.points[0], material)) {
      layer.markings.push({ id: `${featureId}-${layer.index}-${segmentIndex}-label`, operation: feature.operation, kind: feature.kind, points: [segment.points[0]], label: feature.label, textStyle: config.textStyle });
    }
    clipped.filter((points) => feature.kind !== "water" || polylineLength(points) >= config.minimumFeatureMm).forEach((points, clipIndex) => layer.markings.push({
      id: `${featureId}-${layer.index}-${segmentIndex}-${clipIndex}`,
      operation: feature.operation,
      kind: feature.kind,
      points,
    }));
  }
}

/** Route every enabled map feature onto the layers it is visible on; returns transportation label candidates. */
function routeMarkings(context: GenerationContext, clips: LayerClip[], ladder: ElevationLadder): TransportationLabelCandidates {
  const { config, source, flatEngraving } = context;
  const labels: TransportationLabelCandidates = new Map();
  for (const { feature, featureId } of mapFeatures(context, ladder.modelGrid)) {
    if (!markingEnabled(feature, config)) continue;
    // Routing every feature through every elevation band of a flat engraving
    // only explodes one road into dozens of DOM/SVG paths before reassembling it.
    if (flatEngraving) routeFlatMarking(config, feature, featureId, clips[0]!, labels);
    else routeStackMarking(config, feature, featureId, clips, ladder, labels);
  }

  const enabledRoadFeatures = source.markings.filter((feature) => feature.kind === "road" && config.showRoads);
  const roadJunctions = config.lineStyle.roadStyle === "outlined" ? transportationJunctions(enabledRoadFeatures) : [];
  roadJunctions.forEach((junction, junctionIndex) => {
    const ring = junctionRing(junction.point, config.lineStyle.majorRoadSpacingMm / 2);
    (flatEngraving ? clips.slice(0, 1) : clips).forEach(({ layer, material, covering }) => {
      clipPolyline(ring, material, flatEngraving ? undefined : covering).forEach((points, clipIndex) => layer.markings.push({
        id: `road-junction-${junctionIndex}-${layer.index}-${clipIndex}`,
        operation: "engrave",
        kind: "road",
        transportationClass: "major-road",
        points,
      }));
    });
  });
  return labels;
}

/** Annotations must fit the crop whole; the compass follows the exposed stack surface. */
function placeAnnotations({ config, source, clip, warnings, flatEngraving }: GenerationContext, clips: LayerClip[]): void {
  const baseLayer = clips[0]!.layer;
  // All crop boundaries are convex, so endpoint/label-box checks suffice.
  const addAnnotation = (markings: OperationPath[], name: string, followSurface = false): void => {
    const fits = markings.every((marking) => {
      const points = [...marking.points];
      if (marking.label && marking.points[0]) {
        const { x, y } = marking.points[0];
        const { width, height } = labelDimensions(marking.label, marking.textStyle);
        points.push({ x: x + width, y }, { x, y: y + height }, { x: x + width, y: y + height });
      }
      const inset = config.lineStyle.annotationMm / 2;
      return points.every(({ x, y }) => [[-inset, -inset], [inset, -inset], [inset, inset], [-inset, inset]].every(([dx, dy]) => pointInRing({ x: x + dx!, y: y + dy! }, clip)));
    });
    if (!fits) {
      warnings.push({ code: "LABEL_OMITTED", message: `${name} was omitted because it does not fit the material. Increase the output size or reduce the annotation size.` });
      return;
    }
    if (!followSurface || flatEngraving) {
      baseLayer.markings.push(...markings);
      return;
    }
    // Route the complete design onto final material, excluding every sheet above.
    // Letters use the same strokes as preview/SVG text so they remain complete
    // even when a contour passes through a glyph.
    for (const marking of markings) {
      const paths = marking.label && marking.points[0]
        ? labelLineSegments(marking.label, marking.points[0], 0, 0, marking.labelRotationRad, marking.textStyle).map(({ start, end }) => [start, end])
        : [marking.points];
      for (const { layer, material, covering } of clips) {
        paths.forEach((path, pathIndex) => {
          clipPolyline(path, material, covering).forEach((points, clipIndex) => layer.markings.push({
            id: `${marking.id}-${layer.index}-${pathIndex}-${clipIndex}`,
            operation: marking.operation,
            kind: marking.kind,
            points,
          }));
        });
      }
    }
  };

  if (config.showNorthArrow) {
    addAnnotation(northArrowMarkings(config), "North arrow", true);
  }
  if (config.showScaleBar) {
    const radius = cropRadiusMm(config);
    const x = config.cropShape === "circle" ? -radius * 0.58 : -config.widthMm / 2 + 9;
    const y = config.cropShape === "circle" ? radius * 0.58 : -config.heightMm / 2 + 10;
    const groundWidthM = groundWidthMFor(source.bounds);
    // Pick the labeled distance from whatever fits the drawn cap, so the bar
    // length and its engraved label always agree.
    const maxLengthMm = config.cropShape === "circle" ? radius * 0.55 : config.widthMm * 0.35;
    const maxDistanceM = groundWidthM > 0 ? (maxLengthMm / config.widthMm) * groundWidthM : 0;
    const scale = scaleMarking(Math.min(groundWidthM * 0.2, maxDistanceM), config.units);
    const length = groundWidthM > 0 ? (scale.distanceM / groundWidthM) * config.widthMm : 0;
    addAnnotation([
      { id: "scale-main", operation: "engrave", kind: "guide", points: [{ x, y }, { x: x + length, y }] },
      { id: "scale-left", operation: "engrave", kind: "guide", points: [{ x, y: y - 1.7 }, { x, y: y + 1.7 }] },
      { id: "scale-right", operation: "engrave", kind: "guide", points: [{ x: x + length, y: y - 1.7 }, { x: x + length, y: y + 1.7 }] },
      { id: "scale-label", operation: "engrave", kind: "label", points: [{ x, y: y + 5 }], label: scale.label, textStyle: config.textStyle },
    ], "Scale bar");
  }
}

function placeTransportationLabels(config: ProjectConfigV1, labels: TransportationLabelCandidates): number {
  let transportationLabelIndex = 0;
  const labelEntries = [...labels].map(([label, candidates]) => {
    const lengths = candidates.map((candidate) => ({ candidate, length: longestPath(candidate.paths) }));
    return { label, lengths, longest: lengths.reduce((best, { length }) => Math.max(best, length), Number.NEGATIVE_INFINITY) };
  }).sort((left, right) => right.longest - left.longest || left.label.localeCompare(right.label)).slice(0, TRANSPORTATION_LABEL_LIMIT);
  for (const { label, lengths } of labelEntries) {
    const ordered = lengths.sort((left, right) => right.length - left.length).map(({ candidate }) => candidate);
    for (const candidate of ordered) {
      const placement = placeLinearLabel(label, config, candidate.layer, candidate.paths, candidate.excludedPolygons);
      if (!placement) continue;
      candidate.layer.markings.push({
        id: `transport-label-${transportationLabelIndex++}`,
        operation: "engrave",
        kind: "label",
        transportationClass: candidate.transportationClass,
        points: [placement.point],
        label,
        labelRotationRad: placement.rotationRad,
        textStyle: config.textStyle,
      });
      break;
    }
  }
  return transportationLabelIndex;
}

function placeElevationLabels({ config, flatEngraving, warnings }: GenerationContext, layers: LayerIR[]): void {
  const omittedLayers: string[] = [];
  const labelsByLayer = layers.map((layer) => {
    const elevation = Math.round(displayElevation(layer.elevationM, config.units));
    const unit = elevationUnit(config.units);
    return [`${elevation} ${unit}`, `${elevation}${unit}`, `${elevation}`];
  });
  // A flat map labels only its emphasized index contours. Labelling every
  // minor line overwhelms the engraving and implies a label on the base
  // crop boundary, which is not itself a contour.
  const flatLabeled = (layer: LayerIR) => layer.index !== 0 && layer.index % config.engravingIndexInterval === 0;
  const placements = placeElevationLabelStack(labelsByLayer, config, layers, flatEngraving ? { markings: layers[0]!.markings, labeled: flatLabeled } : undefined);
  layers.forEach((layer, layerIndex) => {
    if (flatEngraving && !flatLabeled(layer)) return;
    const placed = placements[layerIndex];
    if (!placed) {
      omittedLayers.push(String(layer.index + 1));
      return;
    }
    layer.markings.push({
      id: `elevation-${layer.index}`,
      operation: "engrave",
      kind: "label",
      points: [placed.placement.point],
      label: placed.label,
      labelRotationRad: placed.placement.rotationRad,
      textStyle: config.textStyle,
    });
  });
  if (omittedLayers.length) warnings.push({
    code: "LABEL_OMITTED",
    message: `Elevation labels were omitted from layer${omittedLayers.length === 1 ? "" : "s"} ${omittedLayers.join(", ")} because no collision-free position fit the exposed face.`,
  });
}

/**
 * Markers are added after every other annotation so their material-colored
 * knockout footprints can visibly interrupt contours, labels, and map
 * details before the solid symbol is drawn on top.
 */
function placeMarkers({ config, source, flatEngraving }: GenerationContext, clips: LayerClip[]): void {
  const materials = (flatEngraving ? clips.slice(0, 1) : clips).map(clip => clip.material);
  config.markers.forEach((marker, markerIndex) => {
    if (!longitudeInBounds(marker.lon, source.bounds) || marker.lat < source.bounds.south || marker.lat > source.bounds.north) return;
    const anchor = geoPointToMapPoint(marker.lat, marker.lon, source.bounds, config.widthMm, config.heightMm);
    if (!materials.some(material => pointInPreparedPolygons(anchor, material))) return;
    const size = marker.sizeMm ?? MAP_MARKER_SIZE_MM;
    const symbolCenter = markerSymbolCenterForAnchor(marker.symbol, anchor, size);
    const paths = markerSymbolPaths(marker.symbol, symbolCenter, size)
      .filter((_, pathIndex) => marker.symbol !== "pin" || pathIndex === 0);
    const place = (path: Point2D[], id: string, knockout = false) => {
      markerLayerPolygons(path, materials).forEach(({ layerIndex, polygon }, pieceIndex) => clips[layerIndex]!.layer.markings.push({
        id: `map-marker-${markerIndex}-${id}-${layerIndex}-${pieceIndex}`,
        operation: "engrave",
        kind: "marker",
        points: polygon.outer,
        ...(polygon.holes.length ? { holes: polygon.holes } : {}),
        filled: true,
        ...(knockout ? { knockout: true } : {}),
      }));
    };
    paths.forEach((path, pathIndex) => {
      offsetClosedRing(path, MAP_MARKER_CLEARANCE_MM, "round").forEach((halo, haloIndex) => place(halo, `halo-${pathIndex}-${haloIndex}`, true));
    });
    paths.forEach((path, pathIndex) => place(path, String(pathIndex)));
  });
}

/**
 * External vector archives are allowed to repeat source IDs. Preserve stable
 * human-readable prefixes while guaranteeing valid keyed previews and unique
 * SVG element IDs even when an upstream tile contains a duplicate feature.
 */
function dedupeMarkingIds(layers: LayerIR[]): void {
  const markingIds = new Set<string>();
  const duplicateCounts = new Map<string, number>();
  layers.forEach((layer) => layer.markings.forEach((marking) => {
    const original = marking.id;
    let occurrence = duplicateCounts.get(original) ?? 0;
    let candidate = occurrence === 0 ? original : `${original}-duplicate-${occurrence}`;
    while (markingIds.has(candidate)) {
      occurrence += 1;
      candidate = `${original}-duplicate-${occurrence}`;
    }
    duplicateCounts.set(original, occurrence + 1);
    marking.id = candidate;
    markingIds.add(candidate);
  }));
}

export function generateGeometry(config: ProjectConfigV1, source: SourceBundleV1): GeometryIRV1 {
  validateProject(config);
  if (source.schemaVersion !== 1) throw new Error("Unsupported source-data schema version.");
  source = smoothLakeShorelines(source, config);
  const grid = measuredElevationGrid(source.elevation);
  assertGeographicBounds(source.bounds, "Source");

  const flatEngraving = config.outputMode === "engraving";
  const context: GenerationContext = {
    config,
    source,
    flatEngraving,
    usesWaterDepth: !flatEngraving && config.showWaterDepth,
    clip: boundary(config),
    warnings: [],
  };
  addSourceWarnings(context);
  const { waterAreas, carved } = carveWater(context, grid);
  const ladder = buildLadder(context, carved, waterAreas);
  const layers = contourLayers(context, ladder);
  const { waterSurfaces, waterPatternAreas } = waterOutputs(context, ladder);

  // Before nesting: cavities record indices into a donor's polygons and holes
  // that splitting would renumber, and a seam through a cavity would leave an
  // open arc where a closed hole belongs.
  const splitPlan = splitLayersForWorkArea(config, layers, context.warnings);
  const fabricationNests = flatEngraving ? [] : addMaterialNests(config, layers);
  // Nesting has finished carving cavities, so layer material is final for routing.
  const clips = layerClips(layers);
  const transportationLabels = routeMarkings(context, clips, ladder);
  placeAnnotations(context, clips);
  if (!flatEngraving && config.showAlignmentGuides) addAlignmentGuides(config, clips);
  addPieceLabels(context, clips);
  const placedTransportationLabels = placeTransportationLabels(config, transportationLabels);
  if (transportationLabels.size && !placedTransportationLabels) context.warnings.push({
    code: "LABEL_OMITTED",
    message: "Transportation labels do not fit the exposed material. Reduce Text size or Vertical exaggeration, or increase the artwork size.",
  });
  if (config.showElevationLabels) placeElevationLabels(context, layers);
  placeMarkers(context, clips);
  dedupeMarkingIds(layers);

  const { landMin, landMax, visibleMin, visibleMax, ladderBase, modelGrid } = ladder;
  return {
    schemaVersion: 1,
    projectId: config.id,
    projectName: config.name,
    units: config.units,
    configFingerprint: projectFingerprint(config),
    sourceKind: source.sourceKind,
    vectorStatus: source.vectorStatus,
    lakeDataStatus: source.lakeDataStatus,
    datasetVersion: source.datasetVersion,
    bounds: source.bounds,
    resolutionM: source.resolutionM,
    imagerySources: source.imagerySources,
    terrainSelection: source.terrainSelection,
    widthMm: config.widthMm,
    heightMm: config.heightMm,
    laserKerfMm: config.laserKerfMm,
    lineStyle: { ...config.lineStyle },
    verticalExaggeration: ladder.stack.verticalExaggeration,
    horizontalScale: horizontalScaleFor(config.widthMm, source.bounds),
    minElevationM: config.cropShape === "circle" ? Math.max(visibleMin, ladderBase) : modelGrid.min,
    maxElevationM: config.cropShape === "circle" ? Math.max(visibleMax, ladderBase) : modelGrid.max,
    landReliefM: landMax - landMin,
    waterDepthBelowLandM: ladder.depthBelowLandM,
    layers,
    waterSurfaces,
    waterPatternAreas,
    fabricationNests,
    splitPlan,
    warnings: context.warnings,
    attribution: source.attribution,
    generatedAt: new Date().toISOString(),
  };
}

export function validateProject(config: ProjectConfigV1): void {
  if (config.schemaVersion !== 1) throw new Error("Unsupported project schema version.");
  if (config.units !== "metric" && config.units !== "imperial") throw new Error("Project units must be metric or imperial.");
  if (config.outputMode !== "stack" && config.outputMode !== "engraving") throw new Error("Project output mode must be stack or engraving.");
  if (config.waterFillPattern !== "none" && config.waterFillPattern !== "lines" && config.waterFillPattern !== "ripples" && config.waterFillPattern !== "dots") throw new Error("Water fill pattern must be none, lines, ripples, or dots.");
  if (config.cropShape !== "rectangle" && config.cropShape !== "circle") throw new Error("Crop shape must be rectangle or circle.");
  if (!config.elevationLabelPosition || typeof config.elevationLabelPosition !== "object") throw new Error("Elevation label position is required.");
  if (!config.textStyle || typeof config.textStyle !== "object") throw new Error("Text style is required.");
  if (!config.lineStyle || typeof config.lineStyle !== "object") throw new Error("Line style is required.");
  if (!config.northArrowPlacement || typeof config.northArrowPlacement !== "object" || !config.northArrowPlacement.offset || typeof config.northArrowPlacement.offset !== "object") throw new Error("North arrow placement is required.");
  if (!Array.isArray(config.markers)) throw new Error("Project markers must be a list.");
  if (!Array.isArray(config.customLines)) throw new Error("Custom lines must be a list.");
  if (typeof config.id !== "string" || !config.id.trim() || config.id.length > MAX_PROJECT_NAME_LENGTH) throw new Error("Project id must contain at most 120 characters.");
  if (typeof config.name !== "string" || !config.name.trim() || config.name.length > MAX_PROJECT_NAME_LENGTH) throw new Error("Project name must contain at most 120 characters.");
  if (!config.location || typeof config.location !== "object" || typeof config.location.label !== "string" || !config.location.label.trim() || config.location.label.length > 240) throw new Error("Project location label must contain at most 240 characters.");
  for (const [label, value] of Object.entries({ showRoads: config.showRoads, showTrails: config.showTrails, showTransportationLabels: config.showTransportationLabels, showWater: config.showWater, showBoundaries: config.showBoundaries, showCoordinateGrid: config.showCoordinateGrid, showWaterDepth: config.showWaterDepth, showAlignmentGuides: config.showAlignmentGuides, optimizeMaterialUse: config.optimizeMaterialUse, showElevationLabels: config.showElevationLabels, showNorthArrow: config.showNorthArrow, showScaleBar: config.showScaleBar, showEngravingBorder: config.showEngravingBorder })) {
    if (typeof value !== "boolean") throw new Error(`${label} must be true or false.`);
  }
  if (config.widthMm <= 0) throw new Error("Project width must be greater than zero.");
  if (config.heightMm <= 0) throw new Error("Project height must be greater than zero.");
  if (config.widthMm > MAX_PROJECT_DIMENSION_MM || config.heightMm > MAX_PROJECT_DIMENSION_MM) throw new Error("Project dimensions must not exceed 10000 mm.");
  if (config.verticalExaggeration < MIN_VERTICAL_EXAGGERATION || config.verticalExaggeration > MAX_VERTICAL_EXAGGERATION) throw new Error(`Vertical exaggeration must be between ${MIN_VERTICAL_EXAGGERATION} and ${MAX_VERTICAL_EXAGGERATION}.`);
  if (typeof config.fitLakeDepth !== "boolean") throw new Error("Fit lake depth must be a boolean.");
  if (config.waterDepthLayerLimit !== undefined && (!Number.isSafeInteger(config.waterDepthLayerLimit) || config.waterDepthLayerLimit < 1)) throw new Error("Maximum depth layers must be a positive whole number.");
  if (!Number.isFinite(config.waterDepthExaggeration) || config.waterDepthExaggeration < MIN_WATER_DEPTH_EXAGGERATION || config.waterDepthExaggeration > MAX_WATER_DEPTH_EXAGGERATION) throw new Error(`Water depth exaggeration must be between ${MIN_WATER_DEPTH_EXAGGERATION} and ${MAX_WATER_DEPTH_EXAGGERATION}.`);
  if (config.materialThicknessMm < 0.5 || config.materialThicknessMm > 25) throw new Error("Material thickness must be between 0.5 and 25 mm.");
  if (config.location.lat < -85.0511 || config.location.lat > 85.0511) throw new Error("This version supports Web Mercator latitudes only.");
  if (config.location.lon < -180 || config.location.lon > 180) throw new Error("Longitude must be between -180 and 180 degrees.");
  const markerIds = new Set<string>();
  if (config.markers.length > MAX_MAP_MARKERS) throw new Error("A project may contain at most 250 markers.");
  for (const marker of config.markers) {
    if (!marker || typeof marker !== "object" || typeof marker.id !== "string" || !marker.id.trim() || marker.id.length > 120) throw new Error("Each marker must have a valid id.");
    if (markerIds.has(marker.id)) throw new Error("Marker ids must be unique.");
    markerIds.add(marker.id);
    if (!Number.isFinite(marker.lat) || marker.lat < -85.0511 || marker.lat > 85.0511) throw new Error("Marker latitude must be within Web Mercator limits.");
    if (!Number.isFinite(marker.lon) || marker.lon < -180 || marker.lon > 180) throw new Error("Marker longitude must be between -180 and 180 degrees.");
    const size = marker.sizeMm === undefined ? MAP_MARKER_SIZE_MM : marker.sizeMm;
    if (!Number.isFinite(size) || size < MAP_MARKER_MIN_SIZE_MM || size > MAP_MARKER_MAX_SIZE_MM) throw new Error(`Marker size must be between ${MAP_MARKER_MIN_SIZE_MM} and ${MAP_MARKER_MAX_SIZE_MM} mm.`);
    if (!MARKER_SYMBOLS.includes(marker.symbol)) throw new Error("Marker symbol is invalid.");
  }
  const customLineIds = new Set<string>();
  if (config.customLines.length > MAX_CUSTOM_LINES) throw new Error("A project may contain at most 250 custom lines.");
  let customPointCount = 0;
  for (const line of config.customLines) {
    if (!line || typeof line !== "object" || typeof line.id !== "string" || !line.id.trim() || line.id.length > 120) throw new Error("Each custom line must have a valid id.");
    if (customLineIds.has(line.id)) throw new Error("Custom line ids must be unique.");
    customLineIds.add(line.id);
    if (!CUSTOM_LINE_KINDS.includes(line.kind)) throw new Error("Custom line type must be trail or boundary.");
    if (!Array.isArray(line.points) || line.points.length < 2) throw new Error("Each custom line must contain at least two points.");
    if (line.points.length > MAX_CUSTOM_LINE_POINTS) throw new Error("Each custom line may contain at most 2000 points.");
    customPointCount += line.points.length;
    if (customPointCount > MAX_CUSTOM_DATA_POINTS) throw new Error("Custom lines may contain at most 10000 points in total.");
    for (const point of line.points) {
      if (!point || typeof point !== "object" || !Number.isFinite(point.lat) || point.lat < -85.0511 || point.lat > 85.0511) throw new Error("Custom line latitude must be within Web Mercator limits.");
      if (!Number.isFinite(point.lon) || point.lon < -180 || point.lon > 180) throw new Error("Custom line longitude must be between -180 and 180 degrees.");
    }
  }
  const lineWidths = [config.lineStyle.contourMm, config.lineStyle.indexContourMm, config.lineStyle.majorRoadMm, config.lineStyle.localRoadMm, config.lineStyle.trailMm, config.lineStyle.waterMm, config.lineStyle.boundaryMm, config.lineStyle.coordinateGridMm, config.lineStyle.annotationMm, config.lineStyle.borderMm];
  if (![config.widthMm, config.heightMm, config.verticalExaggeration, config.materialThicknessMm, config.engravingContourCount, config.engravingIndexInterval, config.minimumFeatureMm, config.glueMarginMm, config.laserKerfMm, config.smoothing, config.location.lat, config.location.lon, config.location.zoom, config.elevationLabelPosition.x, config.elevationLabelPosition.y, config.textStyle.sizeMm, config.northArrowSizeMm, config.northArrowPlacement.offset.x, config.northArrowPlacement.offset.y, ...lineWidths].every(Number.isFinite)) throw new Error("Project values must be finite numbers.");
  if (lineWidths.some((width) => width < 0.05 || width > 1.5)) throw new Error("Line widths must be between 0.05 and 1.5 mm.");
  if (!Number.isFinite(config.lineStyle.majorRoadSpacingMm) || config.lineStyle.majorRoadSpacingMm < 0.2 || config.lineStyle.majorRoadSpacingMm > 4) throw new Error("Major road spacing must be between 0.2 and 4 mm.");
  if (config.lineStyle.roadStyle !== "centerline" && config.lineStyle.roadStyle !== "outlined") throw new Error("Road style must be centerline or outlined.");
  if (config.lineStyle.roadCap !== "round" && config.lineStyle.roadCap !== "square") throw new Error("Road cap must be round or square.");
  if (config.lineStyle.trailPattern !== "solid" && config.lineStyle.trailPattern !== "dashed" && config.lineStyle.trailPattern !== "dotted") throw new Error("Trail pattern must be solid, dashed, or dotted.");
  if (!Number.isInteger(config.engravingContourCount) || config.engravingContourCount < 4 || config.engravingContourCount > 40) throw new Error("Engraving contour count must be an integer between 4 and 40.");
  if (!Number.isInteger(config.engravingIndexInterval) || config.engravingIndexInterval < 2 || config.engravingIndexInterval > 10) throw new Error("Engraving index interval must be an integer between 2 and 10.");
  if (config.minimumFeatureMm < 0.2 || config.minimumFeatureMm > 5) throw new Error("Minimum feature must be between 0.2 and 5 mm.");
  if (config.glueMarginMm < 2 || config.glueMarginMm > 25) throw new Error("Glue margin must be between 2 and 25 mm.");
  if (config.laserKerfMm < 0 || config.laserKerfMm > 1) throw new Error("Laser kerf must be between 0 and 1 mm.");
  for (const [label, value] of [["Work area width", config.workAreaWidthMm], ["Work area height", config.workAreaHeightMm]] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or a positive number of millimeters.`);
    if (value > 0 && (value < MIN_WORK_AREA_MM || value > MAX_PROJECT_DIMENSION_MM)) throw new Error(`${label} must be 0 (unlimited) or between ${MIN_WORK_AREA_MM} and ${MAX_PROJECT_DIMENSION_MM} mm.`);
    if (value > 0 && value - config.laserKerfMm < MIN_WORK_AREA_MM) throw new Error(`${label} must leave at least ${MIN_WORK_AREA_MM} mm of usable bed after the laser kerf.`);
  }
  if (config.smoothing !== 0 && config.smoothing !== 1) throw new Error("Contour smoothing must be 0 or 1.");
  if (Math.abs(config.elevationLabelPosition.x) > 0.9 || Math.abs(config.elevationLabelPosition.y) > 0.9) throw new Error("Elevation label position must be between -90% and 90%.");
  if (config.textStyle.font !== "technical" && config.textStyle.font !== "rounded" && config.textStyle.font !== "stencil") throw new Error("Text font must be technical, rounded, or stencil.");
  if (config.textStyle.sizeMm < 2 || config.textStyle.sizeMm > 10) throw new Error("Text size must be between 2 and 10 mm.");
  if (!NORTH_ARROW_STYLES.includes(config.northArrowStyle)) throw new Error("North arrow style must be minimal, classic, or mariner.");
  if (!NORTH_ARROW_ANCHORS.includes(config.northArrowPlacement.anchor)) throw new Error("North arrow anchor is invalid.");
  const northArrowMaximum = Math.min(NORTH_ARROW_MAX_SIZE_MM, Math.max(NORTH_ARROW_MIN_SIZE_MM, Math.min(config.widthMm, config.heightMm) * NORTH_ARROW_MAX_MAP_FRACTION));
  if (config.northArrowSizeMm < NORTH_ARROW_MIN_SIZE_MM || config.northArrowSizeMm > northArrowMaximum) throw new Error(`North arrow size must be between ${NORTH_ARROW_MIN_SIZE_MM} and ${northArrowMaximum} mm.`);
  if (Math.abs(config.northArrowPlacement.offset.x) > 1 || Math.abs(config.northArrowPlacement.offset.y) > 1) throw new Error("North arrow offsets must be between -100% and 100%.");
  if (!config.waterDepthOverrides || typeof config.waterDepthOverrides !== "object") throw new Error("Water depth overrides are required.");
  for (const [lake, depth] of Object.entries(config.waterDepthOverrides)) {
    if (!/^[1-9]\d*$/.test(lake)) throw new Error(`Water depth override key ${lake} must be a HydroLAKES id.`);
    if (!Number.isFinite(depth) || depth <= 0 || depth > 12000) throw new Error(`Water depth override for lake ${lake} must be between 0 and 12000 m.`);
  }
  const bounds = config.location.bounds;
  if (bounds) assertGeographicBounds(bounds, "Project");
}

export function createSyntheticSource(config: ProjectConfigV1, size = 96): SourceBundleV1 {
  const values = new Float32Array(size * size);
  const seedX = Math.sin(config.location.lat * 0.13) * 0.8;
  const seedY = Math.cos(config.location.lon * 0.11) * 0.8;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1) - 0.5) * 2;
      const ny = (y / (size - 1) - 0.5) * 2;
      const peak = Math.exp(-((nx - seedX * 0.22) ** 2 * 2.6 + (ny - seedY * 0.22) ** 2 * 3.2));
      const ridge = Math.exp(-Math.abs(ny + Math.sin(nx * 4.2 + seedX) * 0.22) * 5.5) * 0.36;
      const detail = Math.sin(nx * 10 + seedY * 3) * Math.cos(ny * 8 - seedX * 4) * 0.055;
      // ~1.2 km of relief. The amplitude has to stay believable for the window
      // below, because layer count is derived from the two together.
      const elevation = 850 + (peak + ridge + detail) * 860;
      values[y * size + x] = elevation;
      min = Math.min(min, elevation);
      max = Math.max(max, elevation);
    }
  }
  return {
    schemaVersion: 1,
    elevation: { width: size, height: size, values, min, max },
    markings: [],
    vectorStatus: "available",
    lakeDataStatus: "available",
    datasetVersion: "synthetic-v1",
    sourceKind: "synthetic",
    // Roughly the ground window the app requests at its default zoom, so the
    // fallback's map scale — and the layer count derived from it — stay sane.
    bounds: config.location.bounds ?? { west: config.location.lon - 0.1445, south: config.location.lat - 0.101, east: config.location.lon + 0.1445, north: config.location.lat + 0.101 },
    imagerySources: [],
    attribution: [{ name: "TopoStack deterministic terrain preview", url: "https://github.com/", license: "Development fixture" }],
  };
}
