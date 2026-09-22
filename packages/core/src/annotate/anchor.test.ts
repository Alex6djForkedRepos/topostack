import { describe, expect, it } from "vitest";
import { ANCHOR_VECTORS, anchoredCenter, placementAt } from "./anchor.js";
import { DEFAULT_PROJECT, generateGeometry, NORTH_ARROW_ANCHORS, northArrowCenter, northArrowPlacementAt, plaqueBox, plaquePlacementAt, scaleBarCenter, scaleBarFootprint, scaleBarMarkings, scaleBarPlacementAt } from "../index.js";
import { realSource } from "../test-support/sources.js";

const rectangle = { widthMm: 200, heightMm: 120, cropShape: "rectangle" as const };
const circle = { widthMm: 160, heightMm: 160, cropShape: "circle" as const };

describe("free annotation placement", () => {
  it("round-trips any center inside the travel", () => {
    for (const config of [rectangle, circle]) {
      for (const center of [{ x: 0, y: 0 }, { x: 20, y: -15 }, { x: -50, y: 30 }, { x: 45, y: 40 }, { x: -3, y: 50 }]) {
        const placement = placementAt(config, center, 10, 6);
        const result = anchoredCenter(config, placement, 10, 6);
        expect(result.x).toBeCloseTo(center.x, 4);
        expect(result.y).toBeCloseTo(center.y, 4);
      }
    }
  });

  it("keeps offsets within the validated range and clamps drops outside the crop", () => {
    for (const config of [rectangle, circle]) {
      for (let x = -300; x <= 300; x += 37) {
        for (let y = -300; y <= 300; y += 41) {
          const placement = placementAt(config, { x, y }, 10, 6);
          expect(Math.abs(placement.offset.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(placement.offset.y)).toBeLessThanOrEqual(1);
          expect(NORTH_ARROW_ANCHORS).toContain(placement.anchor);
        }
      }
    }
    const corner = anchoredCenter(rectangle, placementAt(rectangle, { x: 999, y: -999 }, 10, 6), 10, 6);
    expect(corner).toEqual(anchoredCenter(rectangle, { anchor: "top-right", offset: { x: 0, y: 0 } }, 10, 6));
    const edge = anchoredCenter(circle, placementAt(circle, { x: 999, y: 0 }, 10, 6), 10, 6);
    expect(Math.hypot(edge.x, edge.y)).toBeCloseTo(80 - 10 - 3, 4);
  });

  it("picks the nearest anchor so a title aligns toward the edge it sits beside", () => {
    expect(placementAt(rectangle, { x: -70, y: 40 }, 10, 6).anchor).toBe("bottom-left");
    expect(placementAt(rectangle, { x: 5, y: -2 }, 10, 6).anchor).toBe("center");
    expect(placementAt(rectangle, { x: 80, y: 0 }, 10, 6).anchor).toBe("right");
  });

  it("returns every existing anchor unchanged", () => {
    for (const anchor of NORTH_ARROW_ANCHORS) {
      const center = anchoredCenter(rectangle, { anchor, offset: { x: 0, y: 0 } }, 10, 6);
      expect(placementAt(rectangle, center, 10, 6)).toEqual({ anchor, offset: { x: 0, y: 0 } });
      expect(ANCHOR_VECTORS[anchor]).toBeDefined();
    }
  });

  it("centers an axis the annotation fills", () => {
    const tight = { widthMm: 26, heightMm: 120, cropShape: "rectangle" as const };
    expect(placementAt(tight, { x: 12, y: 0 }, 10, 6).offset.x).toBe(0);
  });

  it("places the compass and title where they are dropped", () => {
    const project = { ...DEFAULT_PROJECT, plaque: { enabled: true, text: "Mount Hood", sizeMm: 6, placement: { anchor: "bottom-left" as const, offset: { x: 0, y: 0 } } } };
    const compass = northArrowCenter({ ...project, northArrowPlacement: northArrowPlacementAt(project, { x: -12, y: 8 }) });
    expect(compass.x).toBeCloseTo(-12, 4);
    expect(compass.y).toBeCloseTo(8, 4);
    const placement = plaquePlacementAt(project, { x: 10, y: -14 })!;
    const title = plaqueBox({ ...project, plaque: { ...project.plaque, placement } })!;
    expect(title.center.x).toBeCloseTo(10, 4);
    expect(title.center.y).toBeCloseTo(-14, 4);
    expect(plaquePlacementAt(DEFAULT_PROJECT, { x: 0, y: 0 })).toBeUndefined();
  });
});

describe("scale bar placement", () => {
  it("keeps its original spot until placed, then moves anywhere inside the crop", () => {
    const groundWidthM = 20_000;
    const start = scaleBarMarkings(DEFAULT_PROJECT, groundWidthM).find((marking) => marking.id === "scale-main")!;
    expect(start.points[0]).toEqual({ x: -DEFAULT_PROJECT.widthMm / 2 + 9, y: -DEFAULT_PROJECT.heightMm / 2 + 10 });
    const placed = { ...DEFAULT_PROJECT, scaleBarPlacement: scaleBarPlacementAt(DEFAULT_PROJECT, groundWidthM, { x: 30, y: 25 }) };
    const center = scaleBarCenter(placed, groundWidthM);
    expect(center.x).toBeCloseTo(30, 4);
    expect(center.y).toBeCloseTo(25, 4);
    // The whole block stays clear of the crop edge.
    const corner = scaleBarFootprint({ ...DEFAULT_PROJECT, scaleBarPlacement: scaleBarPlacementAt(DEFAULT_PROJECT, groundWidthM, { x: 999, y: 999 }) }, groundWidthM);
    expect(Math.max(...corner.map((point) => point.x))).toBeCloseTo(DEFAULT_PROJECT.widthMm / 2 - 3, 4);
    expect(Math.max(...corner.map((point) => point.y))).toBeCloseTo(DEFAULT_PROJECT.heightMm / 2 - 3, 4);
  });

  it("is engraved on every exposed sheet, not only the bottom one", () => {
    // Across the middle of the relief, where several sheets are exposed.
    const project = { ...DEFAULT_PROJECT, scaleBarPlacement: { anchor: "center" as const, offset: { x: 0, y: 0 } } };
    const geometry = generateGeometry(project, realSource(project));
    const sheets = new Set(geometry.layers.filter((layer) => layer.markings.some((marking) => marking.id.startsWith("scale-"))).map((layer) => layer.index));
    expect(sheets.size).toBeGreaterThan(1);
    expect([...sheets].some((index) => index > 0)).toBe(true);
  });
});
