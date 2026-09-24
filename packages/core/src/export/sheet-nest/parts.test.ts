import { describe, expect, it } from "vitest";
import { generateGeometry } from "../../pipeline/generate.js";
import { pointInRing, realSource } from "../../test-support/sources.js";
import { DEFAULT_PROJECT, type Point2D } from "../../types.js";
import { sheetNestJobKey } from "./job-key.js";
import { MAX_OUTLINE_VERTICES, nestableParts, partOutline } from "./parts.js";
import { DEFAULT_SHEET_NESTING } from "./resolve.js";
import { signedArea } from "../../primitives/geometry2d.js";

const settings = { ...DEFAULT_SHEET_NESTING, sheetWidthMm: 600, sheetHeightMm: 400 };

describe("nestable parts", () => {
  const ir = generateGeometry(DEFAULT_PROJECT, realSource());
  const parts = nestableParts(ir);

  it("puts every polygon in exactly one part and keeps nest families rigid", () => {
    expect(ir.fabricationNests.length).toBeGreaterThan(0);
    const owner = new Map<string, string>();
    for (const part of parts) {
      for (const member of part.members) {
        for (const polygonIndex of member.polygonIndexes) {
          const key = `${member.layerIndex}:${polygonIndex}`;
          expect(owner.has(key)).toBe(false);
          owner.set(key, part.id);
        }
      }
    }
    const polygonCount = ir.layers.reduce((sum, layer) => sum + layer.polygons.filter((polygon) => polygon.outer.length >= 4).length, 0);
    expect(owner.size).toBe(polygonCount);
    for (const nest of ir.fabricationNests) {
      for (const cavity of nest.cavities) {
        // The child travels with the part its donor polygon belongs to.
        const donorPart = owner.get(`${nest.donorLayerIndex}:${cavity.donorPolygonIndex}`);
        expect(owner.get(`${nest.nestedLayerIndex}:${cavity.nestedPolygonIndex}`)).toBe(donorPart);
      }
    }
  });

  it("wraps every member's cut line in a counter-clockwise outline within the vertex budget", () => {
    for (const part of parts) {
      expect(part.outline.length - 1).toBeLessThanOrEqual(MAX_OUTLINE_VERTICES);
      expect(signedArea(part.outline)).toBeGreaterThan(0);
      expect(part.outline[0]).toEqual(part.outline.at(-1));
      for (const member of part.members) {
        for (const polygonIndex of member.polygonIndexes) {
          const outer = ir.layers[member.layerIndex]!.polygons[polygonIndex]!.outer;
          expect(outer.every((point) => pointInRing(point, part.outline))).toBe(true);
        }
      }
    }
  });

  it("labels parts by layer, or by piece id when the model is split", () => {
    expect(parts.some((part) => /^L\d{2}(-\d+)?$/.test(part.label))).toBe(true);
    const project = { ...DEFAULT_PROJECT, workAreaWidthMm: 160, workAreaHeightMm: 120 };
    const split = generateGeometry(project, realSource(project));
    expect(split.splitPlan).toBeDefined();
    const splitParts = nestableParts(split);
    const pieceIds = new Set(split.layers.flatMap((layer) => layer.pieces.map((piece) => piece.id)));
    expect(splitParts.every((part) => pieceIds.has(part.label) || /^L\d{2}/.test(part.label))).toBe(true);
    expect(splitParts.filter((part) => pieceIds.has(part.label)).length).toBeGreaterThan(0);
  });

  it("simplifies long outlines only outward", () => {
    const circle: Point2D[] = Array.from({ length: 2000 }, (_, index) => {
      const angle = (index / 2000) * Math.PI * 2;
      return { x: 50 * Math.cos(angle) + 0.3 * Math.sin(angle * 97), y: 50 * Math.sin(angle) };
    });
    const ring = [...circle, circle[0]!];
    const outline = partOutline(ring, 0.15, 200);
    expect(outline.length - 1).toBeLessThanOrEqual(200);
    expect(ring.every((point) => pointInRing(point, outline))).toBe(true);
  });

  it("keys a job by content: stable across regeneration, sensitive to layout settings, blind to effort", () => {
    const again = nestableParts(generateGeometry(DEFAULT_PROJECT, realSource()));
    const key = sheetNestJobKey(parts, settings);
    expect(key).toMatch(/^nest1-[0-9a-f]{16}$/);
    expect(sheetNestJobKey(again, settings)).toBe(key);
    expect(sheetNestJobKey(parts, { ...settings, timeBudgetS: 120 })).toBe(key);
    expect(sheetNestJobKey(parts, { ...settings, spacingMm: 3 })).not.toBe(key);
    expect(sheetNestJobKey(parts.slice(1), settings)).not.toBe(key);
  });
});
