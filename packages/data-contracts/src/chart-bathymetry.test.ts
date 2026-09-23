import { describe, expect, it } from "vitest";
import {
  CHART_ATTESTATIONS,
  CHART_BATHYMETRY_LIMITS,
  CHART_BATHYMETRY_SCHEMA,
  chartLabelDepthM,
  decodeChartDepths,
  encodeChartDepths,
  isPublishableChart,
  parseUserChartBathymetry,
  type UserChartBathymetryV1,
} from "./chart-bathymetry";

const depths = [Number.NaN, 0, 1.23, 6.1, 12.5, Number.NaN];

function chart(): UserChartBathymetryV1 {
  return {
    schema: CHART_BATHYMETRY_SCHEMA,
    id: "lake-chart-0001",
    lake: { name: " Round Lake ", region: "Ontario, Canada", hylakId: 42, outline: [[-80, 45], [-79.99, 45], [-79.99, 45.01], [-80, 45]] },
    georef: { method: "snap", matrix: [1e-5, 0, -80, 0, -1e-5, 45.01, 0, 0, 1], rmsM: 3.2, iou: 0.94 },
    units: "ft",
    labels: { kind: "depth" },
    intervalM: 3.048,
    contours: [{ depthM: 3.048, line: [[-79.998, 45.002], [-79.995, 45.005], [-79.998, 45.002]], closed: true }],
    spots: [{ lon: -79.995, lat: 45.005, depthM: 12.5 }],
    grid: { bounds: { west: -80, south: 45, east: -79.99, north: 45.01 }, width: 3, height: 2, method: "harmonic", depthsDm: encodeChartDepths(depths) },
    provenance: { title: "Round Lake depth map", publisher: "Example DNR", sourceUrl: "https://example.org/round.pdf", year: 1978, fileSha256: "a".repeat(64), tool: "chart-trace@0.1.0" },
    license: { attestation: "public-domain" },
  };
}

describe("chart depth encoding", () => {
  it("round-trips decimetre depths and keeps uncovered cells as NaN", () => {
    const decoded = decodeChartDepths({ width: 3, height: 2, depthsDm: encodeChartDepths(depths) });
    expect(Array.from(decoded, (value) => (Number.isNaN(value) ? "none" : value))).toEqual(["none", 0, 1.2, 6.1, 12.5, "none"].map((value) => typeof value === "number" ? Math.fround(value) : value));
  });

  it("clamps negative depths to the waterline and encodes large grids", () => {
    const large = new Float32Array(200_000).fill(3);
    large[0] = -2;
    const decoded = decodeChartDepths({ width: 400, height: 500, depthsDm: encodeChartDepths(large) });
    expect(decoded[0]).toBe(0);
    expect(decoded[199_999]).toBe(3);
  });

  it("rejects malformed or mis-sized depth payloads", () => {
    expect(() => decodeChartDepths({ width: 2, height: 2, depthsDm: "***" })).toThrow(/not base64/);
    expect(() => decodeChartDepths({ width: 4, height: 2, depthsDm: encodeChartDepths(depths) })).toThrow(/expected 8/);
  });
});

describe("parseUserChartBathymetry", () => {
  it("accepts a complete chart and trims text", () => {
    const parsed = parseUserChartBathymetry(chart());
    expect(parsed.lake.name).toBe("Round Lake");
    expect(parsed).toEqual({ ...chart(), lake: { ...chart().lake, name: "Round Lake" } });
  });

  it("accepts control-point georeferencing and omits absent optional fields", () => {
    const value = chart();
    value.georef = { method: "control-points", matrix: value.georef.matrix, rmsM: 0, controlPoints: [
      { x: 0, y: 0, lon: -80, lat: 45.01 }, { x: 1000, y: 0, lon: -79.99, lat: 45.01 }, { x: 0, y: 1000, lon: -80, lat: 45 },
    ] };
    value.lake = { outline: value.lake.outline };
    value.provenance = { title: "Scan", fileSha256: "b".repeat(64), tool: "chart-trace@0.1.0" };
    value.license = { attestation: "personal-use", note: "From my own paper copy" };
    const parsed = parseUserChartBathymetry(value);
    expect(parsed.lake).toEqual({ outline: value.lake.outline });
    expect(parsed.georef).not.toHaveProperty("iou");
    expect(parsed.provenance).toEqual({ title: "Scan", fileSha256: "b".repeat(64), tool: "chart-trace@0.1.0" });
  });

  it("keeps the surface elevation behind elevation-labelled contours", () => {
    const value = chart();
    // A reservoir chart labelled in feet above mean sea level, pool at 322 ft.
    value.labels = { kind: "elevation", surfaceElevationM: 322 * 0.3048, datum: " NGVD29 " };
    expect(parseUserChartBathymetry(value).labels).toEqual({ kind: "elevation", surfaceElevationM: 322 * 0.3048, datum: "NGVD29" });
  });

  it.each<[string, (value: UserChartBathymetryV1 & { extra?: unknown }) => void, RegExp]>([
    ["non-object", (value) => { value.lake = [] as never; }, /lake must be an object/],
    ["unknown top-level field", (value) => { value.extra = 1; }, /unknown field extra/],
    ["schema", (value) => { value.schema = "chart-bathymetry-v2" as never; }, /schema/],
    ["id", (value) => { value.id = "Bad ID"; }, /id must/],
    ["short outline", (value) => { value.lake.outline = value.lake.outline.slice(0, 3); }, /lake outline/],
    ["outline latitude", (value) => { value.lake.outline[1] = [-80, 91]; }, /latitude/],
    ["hylakId", (value) => { value.lake.hylakId = 0; }, /hylakId/],
    ["matrix length", (value) => { value.georef.matrix = [1, 0, 0]; }, /matrix/],
    ["matrix value", (value) => { value.georef.matrix[0] = Number.NaN; }, /matrix entry 0/],
    ["missing control points", (value) => { value.georef.method = "control-points"; }, /control points/],
    ["iou", (value) => { value.georef.iou = 1.5; }, /iou/],
    ["units", (value) => { value.units = "yd" as never; }, /units must be one of/],
    ["labels kind", (value) => { value.labels = { kind: "soundings" } as never; }, /labels kind/],
    ["depth labels with a surface", (value) => { value.labels = { kind: "depth", surfaceElevationM: 98 } as never; }, /take no surface/],
    ["elevation labels without a surface", (value) => { value.labels = { kind: "elevation" } as never; }, /surfaceElevationM/],
    ["elevation labels datum", (value) => { value.labels = { kind: "elevation", surfaceElevationM: 98, datum: " " }; }, /datum/],
    ["interval", (value) => { value.intervalM = 0; }, /intervalM must be greater/],
    ["no contours", (value) => { value.contours = []; }, /contours must list/],
    ["contour depth", (value) => { value.contours[0]!.depthM = CHART_BATHYMETRY_LIMITS.maxDepthM + 1; }, /contour 0 depth/],
    ["contour closed", (value) => { value.contours[0]!.closed = "yes" as never; }, /closed/],
    ["spot depth", (value) => { value.spots = [{ lon: 0, lat: 0, depthM: -1 }]; }, /spot 0 depth/],
    ["grid bounds order", (value) => { value.grid.bounds.east = -81; }, /west < east/],
    ["grid size", (value) => { value.grid.width = CHART_BATHYMETRY_LIMITS.maxGridSide + 1; }, /grid width/],
    ["fractional grid size", (value) => { value.grid.width = 2.5; }, /whole numbers/],
    ["grid method", (value) => { value.grid.method = "kriging" as never; }, /grid method/],
    ["grid depth type", (value) => { value.grid.depthsDm = [1, 2] as never; }, /base64 string/],
    ["grid too deep", (value) => { value.grid.depthsDm = encodeChartDepths([0, 1, 2, 3, 4, 1600]); }, /must not exceed/],
    ["empty grid", (value) => { value.grid.depthsDm = encodeChartDepths(new Array(6).fill(Number.NaN)); }, /covers no cells/],
    ["digest", (value) => { value.provenance.fileSha256 = "ABC"; }, /fileSha256/],
    ["source url", (value) => { value.provenance.sourceUrl = "javascript:alert(1)"; }, /sourceUrl/],
    ["year", (value) => { value.provenance.year = 1978.5; }, /year/],
    ["title", (value) => { value.provenance.title = "  "; }, /title/],
    ["attestation", (value) => { value.license.attestation = "found-online" as never; }, /attestation/],
    ["spdx", (value) => { value.license.spdx = "CC BY 4.0"; }, /spdx/],
  ])("rejects an invalid %s", (_name, mutate, message) => {
    const value = structuredClone(chart());
    mutate(value);
    expect(() => parseUserChartBathymetry(value)).toThrow(message);
  });

  it("rejects contours whose points exceed the total budget", () => {
    const value = chart();
    const half = CHART_BATHYMETRY_LIMITS.maxContourPoints / 2 + 1;
    const line = Array.from({ length: half }, (_, index): [number, number] => [-80 + index * 1e-8, 45]);
    value.contours = [{ depthM: 1, line, closed: false }, { depthM: 2, line, closed: false }];
    expect(() => parseUserChartBathymetry(value)).toThrow(/at most 200000 points/);
  });
});

describe("chartLabelDepthM", () => {
  it("passes depth labels through and measures elevation labels down from the surface", () => {
    expect(chartLabelDepthM({ kind: "depth" }, 6)).toBe(6);
    expect(chartLabelDepthM({ kind: "elevation", surfaceElevationM: 98.1 }, 91.1)).toBeCloseTo(7);
    expect(chartLabelDepthM({ kind: "elevation", surfaceElevationM: 98.1 }, 99.1)).toBeCloseTo(-1);
  });
});

describe("isPublishableChart", () => {
  it("keeps personal-use charts out of the catalog", () => {
    expect(CHART_ATTESTATIONS.filter((attestation) => isPublishableChart({ license: { attestation } }))).toEqual(["own-work", "public-domain", "open-license"]);
  });
});

it("round-trips island and interior metadata and rejects invalid target directions", () => {
  const record = chart();
  record.lake.islands = [[[-79.998,45.002],[-79.997,45.002],[-79.997,45.003]]];
  record.contours[0] = {...record.contours[0]!, depthM: 10, inside: "shallower", interiorDepthM: 4};
  const parsed = parseUserChartBathymetry(record);
  expect(parsed.lake.islands).toEqual(record.lake.islands);
  expect(parsed.contours[0]).toEqual(record.contours[0]);
  record.contours[0]!.interiorDepthM = 12;
  expect(() => parseUserChartBathymetry(record)).toThrow(/direction/);
});
