import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT } from "@topostack/core";
import { createSamplePreviewSource } from "$lib/domain/sample-preview";
import { createProjectPreviewSource } from "$lib/studio/project-preview";

describe("project opening preview", () => {
  it("preserves Crater Lake terrain and lake depths after restoring edited settings", () => {
    const source = createProjectPreviewSource({ ...DEFAULT_PROJECT, name: "My lake", materialThicknessMm: 4, verticalExaggeration: 3 });
    const bundled = createSamplePreviewSource();
    expect(source.sourceKind).toBe("preview");
    expect(source.elevation).toEqual(bundled.elevation);
    expect(source.waterAreas).toEqual(bundled.waterAreas);
    expect(source.waterAreas?.length).toBeGreaterThan(0);
  });

  it("rescales shoreline and roads when the same crop is resized", () => {
    const bundled = createSamplePreviewSource();
    const source = createProjectPreviewSource({ ...DEFAULT_PROJECT, widthMm: 600, heightMm: 400,
      location: { ...DEFAULT_PROJECT.location, bounds: bundled.bounds } });
    expect(source.sourceKind).toBe("preview");
    expect(source.markings[0]!.points[0]!.x).toBe(bundled.markings[0]!.points[0]!.x * 2);
    expect(source.waterAreas![0]!.polygon.outer[0]!.y).toBe(bundled.waterAreas![0]!.polygon.outer[0]!.y * 2);
    expect(source.elevation).toEqual(bundled.elevation);
  });

  it.each([
    { location: { ...DEFAULT_PROJECT.location, lat: 44 } },
    { location: { ...DEFAULT_PROJECT.location, zoom: 12 } },
    { widthMm: 200 },
    { location: { ...DEFAULT_PROJECT.location, bounds: { west: -111, east: -110, south: 43, north: 44 } } },
  ])("requires fresh terrain for a different map area: %j", (patch) => {
    expect(createProjectPreviewSource({ ...DEFAULT_PROJECT, ...patch }).sourceKind).toBe("synthetic");
  });
});
