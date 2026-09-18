import ClipperLib from "clipper-lib";
import type { Point2D, Polygon2D } from "./types.js";

const CLIPPER_SCALE = 10_000;

function samePoint(left: Point2D, right: Point2D): boolean {
  return left.x === right.x && left.y === right.y;
}

export function offsetClosedRing(points: Point2D[], distanceMm: number, join: "miter" | "round" = "miter"): Point2D[][] {
  if (points.length < 4) return [];
  if (Math.abs(distanceMm) < 1e-9) return [[...points]];
  const first = points[0]!;
  const open = samePoint(first, points.at(-1)!) ? points.slice(0, -1) : [...points];
  const path: ClipperLib.Path = open.map((point) => ({ X: Math.round(point.x * CLIPPER_SCALE), Y: Math.round(point.y * CLIPPER_SCALE) }));
  if (ClipperLib.Clipper.Area(path) < 0) path.reverse();
  const offsetter = new ClipperLib.ClipperOffset(2, 0.01 * CLIPPER_SCALE);
  offsetter.AddPath(path, join === "round" ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const solution: ClipperLib.Paths = [];
  offsetter.Execute(solution, distanceMm * CLIPPER_SCALE);
  return solution
    .filter((ring) => ring.length >= 3)
    .sort((left, right) => Math.abs(ClipperLib.Clipper.Area(right)) - Math.abs(ClipperLib.Clipper.Area(left)))
    .map((ring) => {
      const result = ring.map((point) => ({ x: point.X / CLIPPER_SCALE, y: point.Y / CLIPPER_SCALE }));
      return [...result, result[0]!];
    });
}

function toPath(points: Point2D[]): ClipperLib.Path {
  const open = points.length > 1 && samePoint(points[0]!, points.at(-1)!) ? points.slice(0, -1) : points;
  return open.map((point) => ({ X: Math.round(point.x * CLIPPER_SCALE), Y: Math.round(point.y * CLIPPER_SCALE) }));
}

/** Every ring of `polygons` as Clipper paths: outers wound positive, holes negative, so non-zero filling reads them as one region. */
function toPaths(polygons: Polygon2D[]): ClipperLib.Paths {
  return polygons.flatMap((polygon) => {
    const outer = toPath(polygon.outer);
    if (ClipperLib.Clipper.Area(outer) < 0) outer.reverse();
    return [outer, ...polygon.holes.map((hole) => {
      const path = toPath(hole);
      if (ClipperLib.Clipper.Area(path) > 0) path.reverse();
      return path;
    })];
  }).filter((path) => path.length >= 3);
}

function fromTree(tree: ClipperLib.PolyTree): Polygon2D[] {
  const toRing = (path: ClipperLib.Path): Point2D[] => {
    const ring = path.map((point) => ({ x: point.X / CLIPPER_SCALE, y: point.Y / CLIPPER_SCALE }));
    return [...ring, ring[0]!];
  };
  return ClipperLib.JS.PolyTreeToExPolygons(tree)
    .filter((polygon) => polygon.outer.length >= 3)
    .map((polygon) => ({ outer: toRing(polygon.outer), holes: polygon.holes.filter((hole) => hole.length >= 3).map(toRing) }));
}

/**
 * A boolean of two polygon sets on Clipper's integer grid (0.1 µm), which
 * copes with the edge-on-edge input that a stencil is made of: the windows
 * of a piece run along the piece's own outline for long stretches.
 */
export function clipPolygons(subject: Polygon2D[], clip: Polygon2D[], operation: "difference" | "intersection" | "union"): Polygon2D[] {
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(toPaths(subject), ClipperLib.PolyType.ptSubject, true);
  clipper.AddPaths(toPaths(clip), ClipperLib.PolyType.ptClip, true);
  const type = { difference: ClipperLib.ClipType.ctDifference, intersection: ClipperLib.ClipType.ctIntersection, union: ClipperLib.ClipType.ctUnion }[operation];
  const tree = new ClipperLib.PolyTree();
  clipper.Execute(type, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return fromTree(tree);
}

/**
 * Offset a polygon set as one region: positive grows, negative shrinks. Holes
 * travel with their outer, so an island inside a hole is offset on its own
 * and never carved away by the hole around it.
 */
export function offsetPolygons(polygons: Polygon2D[], distanceMm: number, join: "miter" | "round" = "miter"): Polygon2D[] {
  const paths = toPaths(polygons);
  if (!paths.length) return [];
  const offsetter = new ClipperLib.ClipperOffset(2, 0.01 * CLIPPER_SCALE);
  offsetter.AddPaths(paths, join === "round" ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const tree = new ClipperLib.PolyTree();
  offsetter.Execute(tree, distanceMm * CLIPPER_SCALE);
  return fromTree(tree);
}
