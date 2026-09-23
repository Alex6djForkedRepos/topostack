import { describe, expect, it } from "vitest";
import { markerIconPolygons, MAX_MARKER_ICON_POINTS, type Point2D, type Polygon2D } from "@topostack/core";
import { iconNameFromFile, importSvgIcon, parseTransform, svgIconFromText } from "$lib/domain/svg-icon-import";

const options = { id: "icon-0001", name: "Test" };
const signedArea = (ring: Point2D[]) => ring.reduce((sum, point, index) => { const next = ring[(index + 1) % ring.length]!; return sum + point.x * next.y - next.x * point.y; }, 0) / 2;
const area = (polygons: Polygon2D[]) => polygons.reduce((sum, { outer, holes }) => sum + Math.abs(signedArea(outer)) - holes.reduce((inner, hole) => inner + Math.abs(signedArea(hole)), 0), 0);
/** The icon drawn 1000 units across, so areas compare to the SVG's by the fit scale. */
const iconArea = (svg: string) => area(markerIconPolygons(svgIconFromText(svg, options).icon, { x: 0, y: 0 }, 1000));
const svg = (body: string, attributes = `viewBox="0 0 24 24"`) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attributes}>${body}</svg>`;

// A Lucide-style icon: no fill, a round-capped currentColor stroke.
const LUCIDE_TENT = svg(`<path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/>`, `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`);

describe("SVG marker icons", () => {
  it("outlines stroke-only icons", () => {
    const { icon, warnings } = svgIconFromText(LUCIDE_TENT, options);
    expect(warnings).toEqual([]);
    expect(icon.shapes.length).toBeGreaterThan(0);
    // Two strokes crossing near the top and a base line: one merged outline, open inside.
    expect(area(markerIconPolygons(icon, { x: 0, y: 0 }, 1000))).toBeLessThan(1000 * 1000 * 0.5);
  });

  it("honors fill rules, and white paint cuts out what lies beneath", () => {
    const frame = iconArea(svg(`<path fill-rule="evenodd" d="M0 0H10V10H0Z M2 2H8V8H2Z"/>`, `viewBox="0 0 10 10"`));
    expect(frame).toBeCloseTo(1_000_000 * 0.64, -3);
    const solid = iconArea(svg(`<path d="M0 0H10V10H0Z M2 2H8V8H2Z"/>`, `viewBox="0 0 10 10"`));
    expect(solid).toBeCloseTo(1_000_000, -3);
    const erased = iconArea(svg(`<style>.paper{fill:#FFF}</style><rect width="10" height="10"/><rect class="paper" x="2" y="2" width="6" height="6"/>`, `viewBox="0 0 10 10"`));
    expect(erased).toBeCloseTo(1_000_000 * 0.64, -3);
  });

  it("applies group transforms, nested use, and stylesheet classes", () => {
    const direct = svgIconFromText(svg(`<rect x="0" y="0" width="20" height="10"/>`), options).icon;
    const transformed = svgIconFromText(svg(`
      <defs><rect id="bar" width="10" height="5" class="ink"/></defs>
      <style>.ink { fill: #333 } #hidden { display: none }</style>
      <g transform="translate(5 5) scale(2)"><use href="#bar"/></g>
      <circle id="hidden" cx="100" cy="100" r="3"/>
    `), options).icon;
    expect(transformed.shapes).toEqual(direct.shapes);
  });

  it("draws a white-only icon rather than nothing", () => {
    expect(iconArea(svg(`<circle cx="5" cy="5" r="5" fill="white"/>`, `viewBox="0 0 10 10"`))).toBeCloseTo(Math.PI * 500 * 500, -3);
  });

  it("warns about what it leaves out", () => {
    const { warnings } = svgIconFromText(svg(`<rect width="10" height="10" clip-path="url(#c)" fill="url(#g)"/><text>Hi</text><image href="x.png"/>`), options);
    expect(warnings).toEqual(expect.arrayContaining([expect.stringMatching(/text/i), expect.stringMatching(/images/i), expect.stringMatching(/clipping/i), expect.stringMatching(/gradients/i)]));
  });

  it("refuses files that are not SVG or draw nothing", () => {
    expect(() => svgIconFromText("not xml", options)).toThrow(/not a readable SVG/);
    expect(() => svgIconFromText(`<html><body/></html>`, options)).toThrow(/not a readable SVG/);
    expect(() => svgIconFromText(svg(`<rect width="10" height="10" fill="none"/>`), options)).toThrow(/no filled or stroked/);
    expect(() => svgIconFromText(svg(`<line x1="0" y1="0" x2="10" y2="0"/>`), options)).toThrow(/no filled or stroked/);
  });

  it("keeps every import inside the point budget", () => {
    const circles = Array.from({ length: 30 }, (_, index) => `<circle cx="${index * 3}" cy="${index % 5 * 3}" r="1"/>`).join("");
    const { icon } = svgIconFromText(svg(circles, `viewBox="0 0 90 15"`), options);
    expect(icon.shapes.reduce((sum, shape) => sum + shape.outer.length / 2, 0)).toBeLessThanOrEqual(MAX_MARKER_ICON_POINTS);
  });

  it("names icons after their file and limits the upload size", async () => {
    expect(iconNameFromFile("mountain_hut-icon.svg")).toBe("mountain hut icon");
    expect(iconNameFromFile(".svg")).toBe("Icon");
    await expect(importSvgIcon({ size: 2_000_000, name: "big.svg", text: async () => "" }, "icon-0001")).rejects.toThrow(/1 MB/);
    const { icon } = await importSvgIcon({ size: 100, name: "tent.svg", text: async () => LUCIDE_TENT }, "icon-0002");
    expect(icon).toMatchObject({ id: "icon-0002", name: "tent" });
  });

  it("composes transform lists left to right", () => {
    const [a, b, c, d, e, f] = parseTransform("translate(10 0) rotate(90)");
    // (1, 0) rotates to (0, 1), then moves right by 10.
    expect(a * 1 + c * 0 + e).toBeCloseTo(10);
    expect(b * 1 + d * 0 + f).toBeCloseTo(1);
    expect(parseTransform("rotate(180 5 5)").map((value) => Math.round(value * 1e9) / 1e9)).toEqual([-1, 0, -0, -1, 10, 10]);
  });
});
