import { describe, expect, it } from "vitest";
import {
  cellEdges,
  createSyntheticSource,
  DEFAULT_PROJECT,
  generateGeometry,
  MAX_SEAM_DIVISIONS,
  planSeamGrid,
  projectFingerprint,
  seamPhase,
  validateProject,
  type GeometryIRV1,
  type Point2D,
  type Polygon2D,
  type ProjectConfigV1,
  type SourceBundleV1,
} from "./index.js";

const EARTH_RADIUS_M = 6_371_008.8;

function gridSource(project: ProjectConfigV1, size: number, elevationAt: (nx: number, ny: number) => number): SourceBundleV1 {
  const values = new Float32Array(size * size);
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const elevation = elevationAt((x / (size - 1) - 0.5) * 2, (y / (size - 1) - 0.5) * 2);
      values[y * size + x] = elevation;
      min = Math.min(min, elevation);
      max = Math.max(max, elevation);
    }
  }
  return { ...createSyntheticSource(project, 2), sourceKind: "real", elevation: { width: size, height: size, values, min, max } };
}

/** Layer count is derived from map scale, so widen the window rather than setting a count. */
function scaledForLayers(project: ProjectConfigV1, source: SourceBundleV1, layerCount: number): [ProjectConfigV1, SourceBundleV1] {
  const relief = source.elevation.max - source.elevation.min;
  const groundWidthM = (relief * project.widthMm * project.verticalExaggeration) / (layerCount * project.materialThicknessMm);
  const halfSpan = groundWidthM / (2 * (Math.PI / 180) * EARTH_RADIUS_M * Math.cos(project.location.lat * (Math.PI / 180)));
  const bounds = {
    west: project.location.lon - halfSpan,
    south: project.location.lat - halfSpan * 0.7,
    east: project.location.lon + halfSpan,
    north: project.location.lat + halfSpan * 0.7,
  };
  return [{ ...project, location: { ...project.location, bounds } }, { ...source, bounds }];
}

/** A cone, so every layer is one island and the terrain spans the whole crop. */
function conicalProject(overrides: Partial<ProjectConfigV1> = {}): [ProjectConfigV1, SourceBundleV1] {
  const base: ProjectConfigV1 = {
    ...DEFAULT_PROJECT,
    widthMm: 300,
    heightMm: 200,
    showWaterDepth: false,
    showRoads: false,
    showTrails: false,
    showWater: false,
    showNorthArrow: false,
    showScaleBar: false,
    showElevationLabels: false,
    optimizeMaterialUse: false,
    ...overrides,
  };
  const source = gridSource(base, 64, (nx, ny) => 1200 * Math.max(0, 1 - Math.hypot(nx, ny)));
  return scaledForLayers({ ...base }, { ...source, sourceKind: "real", imagerySources: ["srtm/N46W122.tif"] }, 6);
}

function ringArea(points: Point2D[]): number {
  let area = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    area += current.x * next.y - next.x * current.y;
  }
  return area / 2;
}

function polygonArea(polygon: Polygon2D): number {
  return polygon.holes.reduce((total, hole) => total - Math.abs(ringArea(hole)), Math.abs(ringArea(polygon.outer)));
}

function materialArea(ir: GeometryIRV1): number {
  return ir.layers.reduce((total, layer) => total + layer.polygons.reduce((sum, polygon) => sum + polygonArea(polygon), 0), 0);
}

function pointInRing(point: Point2D, ring: Point2D[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const a = ring[index]!;
    const b = ring[previous]!;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: Point2D, polygon: Polygon2D): boolean {
  return pointInRing(point, polygon.outer) && !polygon.holes.some((hole) => pointInRing(point, hole));
}

/** Interior seam coordinates of one layer along x, excluding the crop edges. */
function seamsX(config: ProjectConfigV1, layerIndex: number): number[] {
  const grid = planSeamGrid(config)!;
  return cellEdges(config.widthMm, grid.columns, grid.columns > 1 ? seamPhase(layerIndex) : 0).slice(1, -1);
}

function seamsY(config: ProjectConfigV1, layerIndex: number): number[] {
  const grid = planSeamGrid(config)!;
  return cellEdges(config.heightMm, grid.rows, grid.rows > 1 ? seamPhase(layerIndex) : 0).slice(1, -1);
}

describe("machine work-area splitting", () => {
  it("is inert when no work area is set", () => {
    const [config, source] = conicalProject();
    const ir = generateGeometry(config, source);
    expect(ir.splitPlan).toBeUndefined();
    expect(ir.layers.every((layer) => layer.pieces.length === 0)).toBe(true);
    expect(ir.layers.flatMap((layer) => layer.markings).some((mark) => mark.id.startsWith("piece-"))).toBe(false);
  });

  it("leaves a model that already fits unsplit", () => {
    const [config] = conicalProject();
    const exact = { ...config, workAreaWidthMm: config.widthMm + config.laserKerfMm, workAreaHeightMm: config.heightMm + config.laserKerfMm };
    expect(planSeamGrid(exact)).toBeUndefined();
    expect(planSeamGrid({ ...exact, workAreaWidthMm: exact.workAreaWidthMm - 1 })).toBeDefined();
  });

  it("treats 0 on one axis as unlimited", () => {
    const [config, source] = conicalProject();
    const split = { ...config, workAreaWidthMm: 0, workAreaHeightMm: 120 };
    const grid = planSeamGrid(split)!;
    expect(grid.columns).toBe(1);
    expect(grid.rows).toBe(2);
    expect(grid.usableWidthMm).toBe(Number.POSITIVE_INFINITY);

    const ir = generateGeometry(split, source);
    // Only the y axis is divided, so no piece is narrower than the terrain is.
    expect(ir.layers[0]!.pieces.every((piece) => piece.column === 0)).toBe(true);
  });

  it("divides into equal tiles rather than full tiles plus a remainder", () => {
    const [config] = conicalProject();
    const grid = planSeamGrid({ ...config, workAreaWidthMm: 160 + config.laserKerfMm, workAreaHeightMm: 0 })!;
    expect(grid.columns).toBe(2);
    expect(grid.pitchXMm).toBeCloseTo(150, 9);
  });

  it("caps divisions per axis", () => {
    const [config] = conicalProject();
    const grid = planSeamGrid({ ...config, widthMm: 9000, workAreaWidthMm: 25, workAreaHeightMm: 0 })!;
    expect(grid.columns).toBe(MAX_SEAM_DIVISIONS);
  });

  it("staggers alternating layers by half a tile on both axes", () => {
    const [config] = conicalProject({ workAreaWidthMm: 160, workAreaHeightMm: 120 });
    expect(seamPhase(0)).toBe(0);
    expect(seamPhase(1)).toBe(0.5);
    expect(seamPhase(2)).toBe(0);

    const grid = planSeamGrid(config)!;
    // Every seam of an odd layer sits half a pitch from the nearest even seam,
    // so no crack runs through two glued layers.
    for (const seam of seamsX(config, 1)) {
      const nearest = Math.min(...seamsX(config, 0).map((other) => Math.abs(other - seam)));
      expect(nearest).toBeCloseTo(grid.pitchXMm / 2, 6);
    }
    for (const seam of seamsY(config, 1)) {
      const nearest = Math.min(...seamsY(config, 0).map((other) => Math.abs(other - seam)));
      expect(nearest).toBeCloseTo(grid.pitchYMm / 2, 6);
    }
    expect(seamsX(config, 0)).toEqual(seamsX(config, 2));
  });

  it("gives a staggered axis one more cell, with half-tiles at the ends", () => {
    const edges = cellEdges(300, 2, 0.5);
    // Two half-tiles plus one full tile, between the overshot outer edges.
    expect(edges).toHaveLength(4);
    expect(edges[1]).toBeCloseTo(-75, 9);
    expect(edges[2]).toBeCloseTo(75, 9);
    expect(cellEdges(300, 2, 0)).toHaveLength(3);
  });

  it("keeps every piece inside the work area and preserves the material", () => {
    const [config, source] = conicalProject();
    const whole = generateGeometry(config, source);
    const split = { ...config, workAreaWidthMm: 160, workAreaHeightMm: 120 };
    const ir = generateGeometry(split, source);
    const grid = planSeamGrid(split)!;

    expect(ir.splitPlan).toEqual(grid);
    expect(ir.warnings.some((warning) => warning.code === "WORK_AREA_OVERSIZE")).toBe(false);
    for (const layer of ir.layers) {
      expect(layer.pieces).toHaveLength(layer.polygons.length);
      for (const piece of layer.pieces) {
        expect(piece.widthMm).toBeLessThanOrEqual(grid.usableWidthMm + 1e-6);
        expect(piece.heightMm).toBeLessThanOrEqual(grid.usableHeightMm + 1e-6);
      }
    }
    expect(materialArea(ir)).toBeCloseTo(materialArea(whole), 4);
  });

  it("keeps ring winding and closure through the split", () => {
    const [config, source] = conicalProject({ workAreaWidthMm: 160, workAreaHeightMm: 120 });
    const ir = generateGeometry(config, source);
    for (const layer of ir.layers) {
      for (const polygon of layer.polygons) {
        expect(polygon.outer.at(0)).toEqual(polygon.outer.at(-1));
        expect(ringArea(polygon.outer)).toBeGreaterThan(0);
        for (const hole of polygon.holes) {
          expect(hole.at(0)).toEqual(hole.at(-1));
          expect(ringArea(hole)).toBeLessThan(0);
        }
      }
    }
  });

  it("puts every interior point in exactly one piece", () => {
    const [config, source] = conicalProject({ workAreaWidthMm: 160, workAreaHeightMm: 120 });
    const ir = generateGeometry(config, source);
    const layer = ir.layers[0]!;
    let sampled = 0;
    for (let x = -140; x <= 140; x += 7.3) {
      for (let y = -90; y <= 90; y += 5.7) {
        const matches = layer.polygons.filter((polygon) => pointInPolygon({ x, y }, polygon)).length;
        expect(matches).toBeLessThanOrEqual(1);
        sampled += matches;
      }
    }
    expect(sampled).toBeGreaterThan(100);
  });

  it("keeps a small island whole even when a seam crosses it", () => {
    // Two peaks either side of the model's centreline. The upper layers isolate
    // each summit into an island small enough to cut in one piece.
    const base: ProjectConfigV1 = {
      ...DEFAULT_PROJECT,
      widthMm: 300,
      heightMm: 200,
      showWaterDepth: false,
      showRoads: false,
      showTrails: false,
      showWater: false,
      showNorthArrow: false,
      showScaleBar: false,
      showElevationLabels: false,
      optimizeMaterialUse: false,
    };
    const peaks = gridSource(base, 96, (nx, ny) => 1200 * Math.max(
      Math.max(0, 1 - Math.hypot(nx * 3, ny * 3)),
      Math.max(0, 1 - Math.hypot((nx - 0.6) * 4, ny * 4)),
    ));
    const [config, source] = scaledForLayers(base, { ...peaks, imagerySources: ["srtm/N46W122.tif"] }, 6);
    const split = { ...config, workAreaWidthMm: 160, workAreaHeightMm: 120 };
    const whole = generateGeometry(config, source);
    const ir = generateGeometry(split, source);

    const exemptPieces = ir.layers.flatMap((layer) => layer.pieces.filter((piece) => piece.exempt));
    expect(exemptPieces.length).toBeGreaterThan(0);

    // An exempt piece is never re-emitted through the clipper, so its ring is
    // the unsplit run's ring exactly - rounded corners and all.
    const exemptRings = new Set(ir.layers.flatMap((layer) =>
      layer.pieces.filter((piece) => piece.exempt).map((piece) => JSON.stringify(layer.polygons[piece.polygonIndex]))));
    const wholeRings = new Set(whole.layers.flatMap((layer) => layer.polygons.map((polygon) => JSON.stringify(polygon))));
    for (const ring of exemptRings) expect(wholeRings.has(ring)).toBe(true);
    expect(materialArea(ir)).toBeCloseTo(materialArea(whole), 4);
  });

  it("names pieces by layer and grid cell", () => {
    const [config, source] = conicalProject({ workAreaWidthMm: 160, workAreaHeightMm: 120 });
    const ir = generateGeometry(config, source);
    const ids = ir.layers.flatMap((layer) => layer.pieces.map((piece) => piece.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^L\d{2}-[A-Z]\d+(-\d+)?$/.test(id))).toBe(true);
    expect(ir.layers[0]!.pieces.map((piece) => piece.id)).toContain("L01-A1");
  });

  it("engraves piece ids only where the layer above hides them", () => {
    const [config, source] = conicalProject({ workAreaWidthMm: 160, workAreaHeightMm: 120 });
    const ir = generateGeometry(config, source);
    const labels = ir.layers.flatMap((layer, index) => layer.markings
      .filter((mark) => mark.id.startsWith("piece-"))
      .map((mark) => ({ index, point: mark.points[0]! })));
    expect(labels.length).toBeGreaterThan(0);

    for (const { index, point } of labels) {
      const above = ir.layers.slice(index + 1).flatMap((layer) => layer.polygons);
      expect(above.some((polygon) => pointInPolygon(point, polygon))).toBe(true);
    }
    // Nothing covers the summit, so its pieces carry no id at all.
    expect(ir.layers.at(-1)!.markings.some((mark) => mark.id.startsWith("piece-"))).toBe(false);
  });

  it("omits piece ids when assembly labels are off", () => {
    const [config, source] = conicalProject({ workAreaWidthMm: 160, workAreaHeightMm: 120, showAssemblyLabels: false });
    const ir = generateGeometry(config, source);
    expect(ir.layers.flatMap((layer) => layer.markings).some((mark) => mark.id.startsWith("piece-"))).toBe(false);
  });

  it("names the piece an alignment guide belongs to", () => {
    const [config, source] = conicalProject({ workAreaWidthMm: 160, workAreaHeightMm: 120, showAlignmentGuides: true });
    const ir = generateGeometry(config, source);
    const guideLabels = ir.layers.flatMap((layer) => layer.markings)
      .filter((mark) => mark.id.startsWith("alignment-") && mark.label);
    expect(guideLabels.length).toBeGreaterThan(0);
    expect(guideLabels.every((mark) => /^L\d{2}-[A-Z]\d+(-\d+)?$/.test(mark.label!))).toBe(true);
  });

  it("keeps nest cavities consistent with the pieces they were cut from", () => {
    const [config, source] = conicalProject({ workAreaWidthMm: 200, workAreaHeightMm: 150, optimizeMaterialUse: true });
    const ir = generateGeometry(config, source);
    for (const nest of ir.fabricationNests) {
      for (const cavity of nest.cavities) {
        const donor = ir.layers[nest.donorLayerIndex]!.polygons[cavity.donorPolygonIndex];
        const nested = ir.layers[nest.nestedLayerIndex]!.polygons[cavity.nestedPolygonIndex];
        expect(donor).toBeDefined();
        expect(nested).toBeDefined();
        const hole = donor!.holes[cavity.donorHoleIndex]!;
        expect(hole).toBeDefined();
        expect(Math.abs(ringArea(hole))).toBeCloseTo(Math.abs(ringArea(nested!.outer)), 6);
      }
    }
  });

  it("abandons the split rather than emitting more pieces than it will cut", () => {
    const [config, source] = conicalProject({ workAreaWidthMm: 25, workAreaHeightMm: 25 });
    const whole = generateGeometry({ ...config, workAreaWidthMm: 0, workAreaHeightMm: 0 }, source);
    const ir = generateGeometry(config, source);
    expect(ir.warnings.some((warning) => warning.code === "WORK_AREA_UNSPLIT")).toBe(true);
    expect(ir.splitPlan).toBeUndefined();
    expect(ir.layers.every((layer) => layer.pieces.length === 0)).toBe(true);
    expect(materialArea(ir)).toBeCloseTo(materialArea(whole), 6);
  });

  it("splits a flat engraving too, without engraving ids on it", () => {
    const [config, source] = conicalProject({ outputMode: "engraving", workAreaWidthMm: 160, workAreaHeightMm: 120 });
    const ir = generateGeometry(config, source);
    expect(ir.splitPlan).toBeDefined();
    expect(ir.layers[0]!.pieces.length).toBeGreaterThan(1);
    // Nothing is stacked over a flat artwork, so an id could never be hidden.
    expect(ir.layers.flatMap((layer) => layer.markings).some((mark) => mark.id.startsWith("piece-"))).toBe(false);
  });

  it("rejects an unusable work area", () => {
    const base = { ...DEFAULT_PROJECT, location: { ...DEFAULT_PROJECT.location } };
    expect(() => validateProject({ ...base, workAreaWidthMm: -1 })).toThrow(/zero or a positive/);
    expect(() => validateProject({ ...base, workAreaWidthMm: Number.NaN })).toThrow(/zero or a positive/);
    expect(() => validateProject({ ...base, workAreaHeightMm: 5 })).toThrow(/0 \(unlimited\)/);
    expect(() => validateProject({ ...base, workAreaWidthMm: 20, laserKerfMm: 0.5 })).toThrow(/usable bed/);
    expect(() => validateProject({ ...base, workAreaWidthMm: 300, workAreaHeightMm: 200 })).not.toThrow();
    expect(() => validateProject(base)).not.toThrow();
  });

  it("changes the export fingerprint", () => {
    const base = { ...DEFAULT_PROJECT };
    expect(projectFingerprint({ ...base, workAreaWidthMm: 300 })).not.toBe(projectFingerprint(base));
    expect(projectFingerprint({ ...base, showAssemblyLabels: false })).not.toBe(projectFingerprint(base));
  });

  it("is deterministic", () => {
    const [config, source] = conicalProject({ workAreaWidthMm: 160, workAreaHeightMm: 120 });
    const first = generateGeometry(config, source);
    const second = generateGeometry(config, source);
    expect(first.layers.map((layer) => layer.pieces.map((piece) => piece.id)))
      .toEqual(second.layers.map((layer) => layer.pieces.map((piece) => piece.id)));
  });
});
