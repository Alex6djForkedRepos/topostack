import { describe, expect, it } from "vitest";
import { buildMarkerIcon, markerIconBottom, markerIconPointCount, markerIconPolygons, MarkerIconError, paintedRegion, type MarkerIconPaint } from "./marker-icons.js";
import { flattenSvgPath } from "./svg-path-data.js";
import { signedArea } from "../primitives/geometry2d.js";
import { MARKER_ICON_UNITS, MAX_MARKER_ICON_POINTS, type Polygon2D } from "../types.js";

const fill = (d: string, rule: "nonzero" | "evenodd" = "nonzero", erase = false): MarkerIconPaint => ({ kind: "fill", polylines: flattenSvgPath(d, 0.01), rule, ...(erase ? { erase } : {}) });
const stroke = (d: string, width: number, cap: "butt" | "round" | "square" = "butt"): MarkerIconPaint => ({ kind: "stroke", polylines: flattenSvgPath(d, 0.01), width, cap, join: "miter" });
const area = (polygons: Polygon2D[]) => polygons.reduce((sum, { outer, holes }) => sum + Math.abs(signedArea(outer)) - holes.reduce((inner, hole) => inner + Math.abs(signedArea(hole)), 0), 0);
const options = { id: "icon-0001", name: "Test" };

// Two squares wound the same way: nonzero fills the inner one, even-odd cuts it out.
const nested = "M0 0 H10 V10 H0 Z M3 3 H7 V7 H3 Z";

describe("marker icon painting", () => {
  it("honors the fill rule", () => {
    expect(area(paintedRegion([fill(nested, "nonzero")]))).toBeCloseTo(100);
    expect(area(paintedRegion([fill(nested, "evenodd")]))).toBeCloseTo(84);
  });

  it("fills open subpaths as if closed", () => {
    expect(area(paintedRegion([fill("M0 0 H10 V10 H0")]))).toBeCloseTo(100);
  });

  it("outlines strokes with their caps and strokes closed rings on both sides", () => {
    expect(area(paintedRegion([stroke("M0 0 H10", 2)]))).toBeCloseTo(20);
    expect(area(paintedRegion([stroke("M0 0 H10", 2, "square")]))).toBeCloseTo(24);
    expect(area(paintedRegion([stroke("M0 0 H10", 2, "round")]))).toBeCloseTo(20 + Math.PI, 1);
    // A 10 mm square stroked 2 wide: 12² outside less 8² inside.
    expect(area(paintedRegion([stroke("M0 0 H10 V10 H0 Z", 2)]))).toBeCloseTo(80);
  });

  it("lets later white paint erase earlier ink", () => {
    expect(area(paintedRegion([fill("M0 0 H10 V10 H0 Z"), fill("M3 3 H7 V7 H3 Z", "nonzero", true)]))).toBeCloseTo(84);
    // Erasing before anything is drawn leaves nothing to erase.
    expect(area(paintedRegion([fill("M3 3 H7 V7 H3 Z", "nonzero", true), fill("M0 0 H10 V10 H0 Z")]))).toBeCloseTo(100);
  });
});

describe("building a marker icon", () => {
  it("fits the longer side to the icon box, centered, keeping holes", () => {
    const icon = buildMarkerIcon([fill("M100 100 H300 V200 H100 Z M150 125 H250 V175 H150 Z", "evenodd")], { ...options, anchor: "bottom" });
    expect(icon).toMatchObject({ id: "icon-0001", name: "Test", anchor: "bottom" });
    expect(icon.shapes).toHaveLength(1);
    expect(icon.shapes[0]!.holes).toHaveLength(1);
    const xs = icon.shapes[0]!.outer.filter((_, index) => index % 2 === 0);
    const ys = icon.shapes[0]!.outer.filter((_, index) => index % 2 === 1);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-500, 500]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([-250, 250]);
    expect(markerIconBottom(icon)).toBe(250);
    expect(icon.shapes.flatMap(({ outer, holes }) => [outer, ...(holes ?? [])]).flat().every(Number.isInteger)).toBe(true);
  });

  it("scales stored icons to any marker size", () => {
    const icon = buildMarkerIcon([fill("M0 0 H10 V10 H0 Z")], options);
    const polygons = markerIconPolygons(icon, { x: 5, y: -5 }, 8);
    expect(area(polygons)).toBeCloseTo(64);
    expect(polygons[0]!.outer[0]).toEqual(polygons[0]!.outer.at(-1));
    expect(Math.min(...polygons[0]!.outer.map(({ x }) => x))).toBeCloseTo(1);
  });

  it("simplifies detailed drawings under the point budget", () => {
    // A 3000-sided polygon: far past the budget before simplification.
    const d = `M${Array.from({ length: 3000 }, (_, index) => {
      const angle = index / 3000 * Math.PI * 2;
      const radius = 100 + Math.sin(angle * 40) * 0.2;
      return `${Math.cos(angle) * radius} ${Math.sin(angle) * radius}`;
    }).join(" L")}Z`;
    const icon = buildMarkerIcon([fill(d)], options);
    expect(markerIconPointCount(icon)).toBeLessThanOrEqual(MAX_MARKER_ICON_POINTS);
    expect(area(markerIconPolygons(icon, { x: 0, y: 0 }, MARKER_ICON_UNITS))).toBeCloseTo(Math.PI * 500 * 500, -4);
  });

  it("refuses drawings with nothing painted or too much detail", () => {
    expect(() => buildMarkerIcon([], options)).toThrow(MarkerIconError);
    expect(() => buildMarkerIcon([stroke("M0 0 H10", 0)], options)).toThrow(/no filled or stroked/);
    // Hundreds of separate specks cannot be simplified away.
    const specks = Array.from({ length: 400 }, (_, index) => `M${index % 20 * 10} ${Math.floor(index / 20) * 10} h4 v4 h-4 Z`).join(" ");
    expect(() => buildMarkerIcon([fill(specks)], options)).toThrow(/too detailed/);
  });
});
