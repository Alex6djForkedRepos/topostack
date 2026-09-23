import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, depthChartLakeKey, validateProject, type ProjectConfigV1 } from "../index.js";

describe("project validation", () => {
  it("bounds project metadata, dimensions, and custom-data complexity", () => {
    const marker = { id: "marker", lat: DEFAULT_PROJECT.location.lat, lon: DEFAULT_PROJECT.location.lon, symbol: "pin" as const };
    const point = { lat: DEFAULT_PROJECT.location.lat, lon: DEFAULT_PROJECT.location.lon };
    expect(() => validateProject({ ...DEFAULT_PROJECT, name: "x".repeat(121) })).toThrow(/project name/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, widthMm: 10_001 })).toThrow(/dimensions/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, markers: Array.from({ length: 251 }, (_, index) => ({ ...marker, id: "marker-" + index })) })).toThrow(/250 markers/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, customLines: [{ id: "long", kind: "trail", points: Array.from({ length: 2_001 }, () => point) }] })).toThrow(/2000 points/i);
  });

  it("accepts bounded positive fabrication sizes", () => {
    expect(() => validateProject({ ...DEFAULT_PROJECT, widthMm: 2_400, heightMm: 1_200 })).not.toThrow();
    expect(() => validateProject({ ...DEFAULT_PROJECT, widthMm: 0 })).toThrow(/greater than zero/i);
  });

  it("validates physical line widths and trail patterns", () => {
    expect(() => validateProject({ ...DEFAULT_PROJECT, lineStyle: { ...DEFAULT_PROJECT.lineStyle, contourMm: 0.04 } })).toThrow(/line widths/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, lineStyle: { ...DEFAULT_PROJECT.lineStyle, majorRoadMm: 1.51 } })).toThrow(/line widths/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, lineStyle: { ...DEFAULT_PROJECT.lineStyle, trailPattern: "railroad" as never } })).toThrow(/trail pattern/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, lineStyle: { ...DEFAULT_PROJECT.lineStyle, boundaryMm: 0.01 } })).toThrow(/line widths/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, lineStyle: { ...DEFAULT_PROJECT.lineStyle, coordinateGridMm: 0.01 } })).toThrow(/line widths/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, lineStyle: { ...DEFAULT_PROJECT.lineStyle, majorRoadSpacingMm: 4.1 } })).toThrow(/road spacing/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, lineStyle: { ...DEFAULT_PROJECT.lineStyle, roadStyle: "bordered" as never } })).toThrow(/road style/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, lineStyle: { ...DEFAULT_PROJECT.lineStyle, roadCap: "butt" as never } })).toThrow(/road cap/i);
  });

  it("rejects out-of-range exaggeration and unknown crop shapes", () => {
    expect(() => validateProject({ ...DEFAULT_PROJECT, verticalExaggeration: 10 })).not.toThrow();
    expect(() => validateProject({ ...DEFAULT_PROJECT, verticalExaggeration: 1.1, waterDepthExaggeration: 1.05 })).not.toThrow();
    expect(() => validateProject({ ...DEFAULT_PROJECT, verticalExaggeration: 0.5 })).toThrow(/vertical exaggeration/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, verticalExaggeration: 10.01 })).toThrow(/vertical exaggeration/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, cropShape: "hexagon" as ProjectConfigV1["cropShape"] })).toThrow(/rectangle or circle/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, textStyle: { font: "serif" as ProjectConfigV1["textStyle"]["font"], sizeMm: 3 } })).toThrow(/text font/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, textStyle: { font: "technical", sizeMm: 10.1 } })).toThrow(/text size/i);
  });

  it("rejects depth chart references that name no lake, chart, or content", () => {
    const reference = { id: "round-lake-chart", contentHash: "a".repeat(64) };
    expect(() => validateProject({ ...DEFAULT_PROJECT, userDepthCharts: { "9092": reference } })).not.toThrow();
    expect(() => validateProject({ ...DEFAULT_PROJECT, userDepthCharts: undefined })).not.toThrow();
    expect(() => validateProject({ ...DEFAULT_PROJECT, userDepthCharts: { lake: reference } })).toThrow(/HydroLAKES id/i);
    // A lake HydroLAKES does not know is named by the chart itself.
    expect(() => validateProject({ ...DEFAULT_PROJECT, userDepthCharts: { "outline:round-lake-chart": reference } })).not.toThrow();
    expect(() => validateProject({ ...DEFAULT_PROJECT, userDepthCharts: { "outline:other-lake-chart": reference } }), "an outline key names its own chart").toThrow(/outline:/);
    expect(depthChartLakeKey({ id: "round-lake-chart", hylakId: 9092 })).toBe("9092");
    expect(depthChartLakeKey({ id: "round-lake-chart" })).toBe("outline:round-lake-chart");
    expect(() => validateProject({ ...DEFAULT_PROJECT, userDepthCharts: { "1": { ...reference, id: "Round Lake" } } })).toThrow(/depth chart id/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, userDepthCharts: { "1": { ...reference, contentHash: "short" } } })).toThrow(/content hash/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, userDepthCharts: { "1": "round-lake-chart" } as never })).toThrow(/must be an object/i);
    expect(() => validateProject({ ...DEFAULT_PROJECT, userDepthCharts: [] as never })).toThrow(/must be an object/i);
  });
});
