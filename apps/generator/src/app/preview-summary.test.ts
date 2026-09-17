import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, type GeometryIRV1, type LayerIR, type WaterSurfaceIR } from "@topostack/core";
import { activeDetailCount, activeLinePreset, countDetailMarkings, featuredLayerIndex, layerForEnabledDetail, modeledLakes, sectionSummary, visibleWarnings } from "./preview-summary";
import { LINE_PRESETS } from "./options";

const marking = (id: string, kind: string) => ({ id, kind, points: [] });
const layer = (index: number, markings: Array<ReturnType<typeof marking>>) => ({ index, markings }) as unknown as LayerIR;
const geometry = (layers: LayerIR[], waterSurfaces: Array<Partial<WaterSurfaceIR>> = []) => ({ layers, waterSurfaces, warnings: [] }) as unknown as GeometryIRV1;

describe("preview summaries", () => {
  const layers = [
    layer(0, [marking("north-arrow", "engrave"), marking("scale-bar", "engrave")]),
    layer(1, [marking("road-1", "road"), marking("contour-1", "contour")]),
    layer(2, [marking("trail-1", "trail"), marking("transport-label-1", "engrave"), marking("custom-data-line-1", "trail"), marking("map-marker-1", "engrave")]),
  ];

  it("features the layer with the most informative markings and finds newly enabled details", () => {
    expect(featuredLayerIndex(geometry(layers))).toBe(2);
    expect(layerForEnabledDetail(geometry(layers), { showRoads: true })).toBe(1);
    expect(layerForEnabledDetail(geometry(layers), { showNorthArrow: true })).toBe(0);
    expect(layerForEnabledDetail(geometry(layers), { showWaterDepth: true })).toBeUndefined();
    expect(layerForEnabledDetail(geometry(layers, [{ layerIndex: 3 }]), { showWaterDepth: true })).toBe(3);
    expect(layerForEnabledDetail(geometry(layers), { name: "Renamed" })).toBeUndefined();
  });

  it("counts markings per detail, adding implicit contours for engravings", () => {
    expect(countDetailMarkings(layers, "stack")).toMatchObject({ road: 1, trail: 2, contour: 1, north: 1, scale: 1, transportationLabel: 1, customLine: 1, marker: 1 });
    expect(countDetailMarkings(layers, "engraving").contour).toBe(3);
  });

  it("lists modeled lakes deepest first, skipping surveyed basins", () => {
    const lakes = modeledLakes([
      { id: "a", kind: "lake", hylakId: 1, maxDepthM: 10, depthSource: "predicted" },
      { id: "b", kind: "lake", hylakId: 2, maxDepthM: 40, depthSource: "predicted", name: "Deep" },
      { id: "c", kind: "lake", hylakId: 3, maxDepthM: 90, depthSource: "surveyed" },
      { id: "d", kind: "river", hylakId: 4, maxDepthM: 90 },
    ] as unknown as WaterSurfaceIR[]);
    expect(lakes.map((lake) => [lake.id, lake.name])).toEqual([["b", "Deep"], ["a", "Lake 1"]]);
    expect(modeledLakes(undefined)).toEqual([]);
  });

  it("deduplicates, filters dismissed, prioritizes depth actions, and limits warnings", () => {
    const warnings = [
      { code: "LABEL_OMITTED", message: "Labels" },
      { code: "BATHYMETRY_FALLBACK", message: "Gap" },
      { code: "BATHYMETRY_FALLBACK", message: "Gap" },
      { code: "LAKE_DEPTH_PREDICTED", message: "Predicted" },
      { code: "WATER_DEPTH_CLAMPED", message: "Too deep", action: "fit-lake-depth" },
    ] as GeometryIRV1["warnings"];
    expect(visibleWarnings(warnings, []).map((warning) => warning.message)).toEqual(["Too deep", "Predicted"]);
    expect(visibleWarnings(warnings, ["WATER_DEPTH_CLAMPED-Too deep", "LAKE_DEPTH_PREDICTED-Predicted"]).map((warning) => warning.message)).toEqual(["Labels", "Gap"]);
  });

  it("summarizes sidebar sections for the output mode", () => {
    const engraving = { ...DEFAULT_PROJECT, outputMode: "engraving" as const, showWaterDepth: true, showEngravingBorder: true };
    expect(activeDetailCount(engraving)).toBe(activeDetailCount({ ...engraving, showWaterDepth: false }));
    expect(sectionSummary("details", engraving, 0)).toMatch(/^\d+ details? enabled$/);
    expect(sectionSummary("terrain", DEFAULT_PROJECT, 12)).toBe(`12 layers · ${DEFAULT_PROJECT.materialThicknessMm} mm material`);
    expect(sectionSummary("customData", { ...DEFAULT_PROJECT, markers: [], customLines: [] }, 0)).toBe("0 markers · 0 paths");
    const bold = LINE_PRESETS.find((preset) => preset.value === "bold")!;
    expect(activeLinePreset(bold.style)).toBe("bold");
    expect(sectionSummary("linework", { ...DEFAULT_PROJECT, lineStyle: bold.style }, 0)).toBe("Bold preset");
    expect(sectionSummary("linework", { ...DEFAULT_PROJECT, lineStyle: { ...bold.style, contourMm: 0.99 } }, 0)).toBe("Custom stroke widths");
  });
});
