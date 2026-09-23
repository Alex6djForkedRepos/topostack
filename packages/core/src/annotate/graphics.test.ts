import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, type CustomGraphicV1, type PlacedGraphicV1, type ProjectConfigV1 } from "../index.js";
import { graphicHalfExtents, placedGraphicCenter, placedGraphicFootprint, placedGraphicMarkings, placedGraphicPlacementAt, placedGraphicPolygons } from "./graphics.js";
import { iconShapePolygons, markerIconPolygons } from "./marker-icons.js";

// A 2:1 bar, 1000 units wide and 500 tall, with a square window.
const graphic: CustomGraphicV1 = {
  id: "graphic-0001",
  name: "Bar",
  shapes: [{ outer: [-500, -250, 500, -250, 500, 250, -500, 250], holes: [[-100, -100, -100, 100, 100, 100, 100, -100]] }],
};
const placed: PlacedGraphicV1 = {
  id: "placed-0001",
  graphicId: graphic.id,
  placement: { anchor: "center", offset: { x: 0, y: 0 } },
  sizeMm: 40,
  rotationDeg: 0,
  operation: "engrave",
};
const project: ProjectConfigV1 = { ...DEFAULT_PROJECT, cropShape: "rectangle", widthMm: 200, heightMm: 120, customGraphics: [graphic], placedGraphics: [placed] };

describe("placed graphics", () => {
  it("turns shapes clockwise on the y-down artwork and leaves unrotated markers exactly as before", () => {
    const [bar] = iconShapePolygons(graphic.shapes, { x: 10, y: 0 }, 40, Math.PI / 2);
    // The right end (500, 0) turns to point down (+y).
    const xs = bar!.outer.map(({ x }) => x);
    const ys = bar!.outer.map(({ y }) => y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(40);
    expect(iconShapePolygons(graphic.shapes, { x: 3, y: 4 }, 10)).toEqual(markerIconPolygons(graphic, { x: 3, y: 4 }, 10));
  });

  it("measures the turned graphic for anchoring", () => {
    expect(graphicHalfExtents(graphic.shapes, 40, 0)).toMatchObject({ halfWidth: 20, halfHeight: 10 });
    const turned = graphicHalfExtents(graphic.shapes, 40, 90);
    expect(turned.halfWidth).toBeCloseTo(10);
    expect(turned.halfHeight).toBeCloseTo(20);
    expect(turned.radial).toBeCloseTo(Math.hypot(20, 10));
  });

  it("round-trips a dropped center through its placement and clamps it inside the crop", () => {
    const moved = { ...placed, placement: placedGraphicPlacementAt(project, placed, { x: 30, y: -12 }) };
    expect(placedGraphicCenter(project, moved)!.x).toBeCloseTo(30);
    expect(placedGraphicCenter(project, moved)!.y).toBeCloseTo(-12);
    const flung = { ...placed, placement: placedGraphicPlacementAt(project, placed, { x: 500, y: 500 }) };
    // Half the artwork, less the graphic's half extent and the 3 mm clearance.
    expect(placedGraphicCenter(project, flung)).toEqual({ x: 100 - 20 - 3, y: 60 - 10 - 3 });
    // A turned graphic reaches further vertically, so it stops sooner.
    const turned = { ...placed, rotationDeg: 90 };
    const turnedFlung = { ...turned, placement: placedGraphicPlacementAt(project, turned, { x: 500, y: 500 }) };
    expect(placedGraphicCenter(project, turnedFlung)!.y).toBeCloseTo(60 - 20 - 3);
  });

  it("draws nothing when the graphic's artwork is missing", () => {
    const orphan = { ...project, customGraphics: [] };
    expect(placedGraphicPolygons(orphan, placed)).toEqual([]);
    expect(placedGraphicFootprint(orphan, placed)).toBeUndefined();
    expect(placedGraphicMarkings(orphan, placed)).toEqual([]);
  });

  it("previews each operation the way generation will emit it", () => {
    const engraved = placedGraphicMarkings(project, placed);
    expect(engraved.every(({ id }) => id.startsWith("graphic-placed-0001-"))).toBe(true);
    expect(engraved.filter(({ knockout }) => knockout)).toHaveLength(1);
    expect(engraved.find(({ knockout }) => !knockout)).toMatchObject({ filled: true, operation: "engrave", holes: [expect.any(Array)] });
    const scored = placedGraphicMarkings(project, { ...placed, operation: "score" });
    expect(scored).toHaveLength(2);
    expect(scored.every(({ operation, filled }) => operation === "score" && !filled)).toBe(true);
    const cut = placedGraphicMarkings(project, { ...placed, operation: "cut" });
    expect(cut.every(({ kind }) => kind === "guide")).toBe(true);
    expect(placedGraphicFootprint(project, { ...placed, rotationDeg: 45 })).toHaveLength(5);
  });
});
