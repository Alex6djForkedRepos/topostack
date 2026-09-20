import { sampleOffset } from "../primitives/grid.js";
import type { Point2D, Polygon2D } from "../types.js";

type Segment = { a: Point2D; b: Point2D };
interface Node { minX: number; minY: number; maxX: number; maxY: number; left?: Node; right?: Node; segments?: Segment[] }

/** Exact distance to vector shores in ground meters, including island shores.
 * A bounding-volume tree avoids comparing every lake cell with every segment.
 * Only complete lakes use this path: crop edges must never become shores.
 */
export function vectorShoreDistances(
  polygon: Polygon2D, cells: readonly number[], width: number, height: number,
  widthMm: number, heightMm: number, groundWidthM: number, groundHeightM: number,
  into: Float64Array,
): Float64Array {
  const project = (p: Point2D): Point2D => ({ x: p.x / widthMm * groundWidthM, y: p.y / heightMm * groundHeightM });
  const segments: Segment[] = [];
  for (const ring of [polygon.outer, ...polygon.holes]) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = project(ring[i]!), b = project(ring[(i + 1) % ring.length]!);
      if (a.x !== b.x || a.y !== b.y) segments.push({ a, b });
    }
  }
  const build = (parts: Segment[]): Node => {
    const node: Node = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const { a, b } of parts) {
      node.minX = Math.min(node.minX, a.x, b.x); node.minY = Math.min(node.minY, a.y, b.y);
      node.maxX = Math.max(node.maxX, a.x, b.x); node.maxY = Math.max(node.maxY, a.y, b.y);
    }
    if (parts.length <= 8) node.segments = parts;
    else {
      const axis = node.maxX - node.minX >= node.maxY - node.minY ? "x" : "y";
      parts.sort((a, b) => a.a[axis] + a.b[axis] - b.a[axis] - b.b[axis]);
      const middle = parts.length >> 1;
      node.left = build(parts.slice(0, middle)); node.right = build(parts.slice(middle));
    }
    return node;
  };
  const root = build(segments);
  for (const cell of cells) {
    const x = sampleOffset(cell % width, width, groundWidthM);
    const y = sampleOffset(Math.floor(cell / width), height, groundHeightM);
    let nearest = Infinity;
    const bound = (node: Node) => Math.max(0, node.minX - x, x - node.maxX) ** 2 + Math.max(0, node.minY - y, y - node.maxY) ** 2;
    const visit = (node: Node): void => {
      if (bound(node) >= nearest) return;
      if (node.segments) for (const { a, b } of node.segments) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
        nearest = Math.min(nearest, (x - a.x - t * dx) ** 2 + (y - a.y - t * dy) ** 2);
      } else {
        const left = node.left!, right = node.right!;
        if (bound(left) <= bound(right)) { visit(left); visit(right); }
        else { visit(right); visit(left); }
      }
    };
    visit(root);
    into[cell] = Math.sqrt(nearest);
  }
  return into;
}
