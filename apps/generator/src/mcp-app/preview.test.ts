import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT } from "@topostack/core";
import { shareUrl } from "@topostack/data-contracts/share-link";
import { previewConfig, previewInput } from "./preview";

const project = { ...DEFAULT_PROJECT, name: "Mount Hood", plaque: { enabled: true, text: "Hood", sizeMm: 6, placement: { anchor: "bottom-left" as const, offset: { x: 0, y: 0 } } }, markers: [{ id: "m1", lat: 45.37, lon: -121.7, symbol: "star" as const, sizeMm: 8 }] };
const { explodedPreview: _preview, ...design } = project;
const studioUrl = shareUrl(design, "https://topostack.app/studio", "?generate=1");

describe("reading a preview tool result", () => {
  it("decodes the design from the studio link and keeps the plan's estimate", () => {
    const input = previewInput({ structuredContent: { studioUrl, plan: { sheetCount: 27 }, attribution: { text: "Terrain: Mapzen" } } });
    expect(input.project).toMatchObject({ name: "Mount Hood", markers: project.markers });
    expect(input).toMatchObject({ studioUrl, estimatedSheets: 27, attribution: "Terrain: Mapzen" });
  });

  it("passes a tool error on as its text", () => {
    expect(() => previewInput({ isError: true, content: [{ type: "text", text: "area.center.lat: Must be between" }] })).toThrow(/area.center.lat/);
  });

  it("refuses results without a usable link", () => {
    expect(() => previewInput({ structuredContent: {} })).toThrow(/no studio link/);
    expect(() => previewInput({ structuredContent: { studioUrl: "javascript:alert(1)#p=1.x" } })).toThrow(/not a web address/);
    expect(() => previewInput({ structuredContent: { studioUrl: "https://topostack.app/studio#p=1.AAAA" } })).toThrow(/damaged/);
    expect(() => previewInput(null)).toThrow();
  });
});

describe("the preview's generation settings", () => {
  it("keeps the terrain, water and sheet plan, and leaves the engraved details to the studio", () => {
    const config = previewConfig({ ...project, workAreaWidthMm: 300, workAreaHeightMm: 300 });
    expect(config).toMatchObject({
      materialThicknessMm: project.materialThicknessMm, verticalExaggeration: project.verticalExaggeration, showWater: true, showWaterDepth: true,
      showRoads: false, showElevationLabels: false, showNorthArrow: false, markers: [], workAreaWidthMm: 0,
    });
    expect(config).not.toHaveProperty("plaque");
    expect(config.location).toEqual(project.location);
  });
});
