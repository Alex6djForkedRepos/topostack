import { describe, expect, it } from "vitest";
import { createSyntheticSource, DEFAULT_PROJECT, generateGeometry, type Polygon2D } from "@topostack/core";
import { sharedPieceEdges } from "$lib/studio/seam-lines";

const rect = (minX: number, minY: number, maxX: number, maxY: number): Polygon2D => ({
  outer: [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }, { x: minX, y: minY }],
  holes: [],
});

describe("3D seam lines", () => {
  it("finds the joint between butted pieces and nothing on the outline", () => {
    const edges = sharedPieceEdges([rect(0, 0, 10, 10), rect(10, 0, 20, 10)]);
    expect(edges.length).toBeGreaterThan(0);
    for (const [start, end] of edges) {
      expect(start.x).toBe(10);
      expect(end.x).toBe(10);
    }
  });

  it("matches a long edge against a neighbour split at different vertices", () => {
    const right: Polygon2D = { outer: [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 6 }, { x: 10, y: 3 }, { x: 10, y: 0 }], holes: [] };
    const edges = sharedPieceEdges([rect(0, 0, 10, 10), right]);
    // The left piece's single edge plus the right piece's three.
    expect(edges).toHaveLength(4);
  });

  it("draws a keyed seam's straight runs and its tabs alike", () => {
    const config = { ...DEFAULT_PROJECT, widthMm: 300, heightMm: 200, workAreaWidthMm: 160, workAreaHeightMm: 120 };
    const layer = generateGeometry(config, createSyntheticSource(config, 2)).layers[0]!;
    const edges = sharedPieceEdges(layer.polygons);
    const offSeam = edges.filter(([start, end]) => Math.abs(start.x + 5) > 1e-6 || Math.abs(end.x + 5) > 1e-6);
    // Tab outlines leave the straight x = -5 / y = -5 seams...
    expect(offSeam.some(([start]) => Math.abs(start.y + 5) > 1e-6)).toBe(true);
    // ...and every drawn edge stays within a tab's reach of one of them.
    for (const [start] of edges) expect(Math.min(Math.abs(start.x + 5), Math.abs(start.y + 5))).toBeLessThanOrEqual(5.5);
  });
});
