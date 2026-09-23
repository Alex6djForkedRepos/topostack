// Curated depth charts to UserChartBathymetryV1 records. The pure half of
// scripts/data-build/trace-depth-charts.mjs: manifest validation, control
// points, and trace -> georeference -> grid -> record, testable without
// downloads or external tools.

import proj4 from "proj4";
import { fitControlPoints } from "@topostack/chart-trace/georef";
import { buildChartRecord } from "@topostack/chart-trace/record";
import { traceRasterChart } from "@topostack/chart-trace/trace-raster";
import { traceVectorChart } from "@topostack/chart-trace/trace-vector";
import { CHART_ATTESTATIONS, CHART_ID_PATTERN as ID, CHART_UNIT_METRES } from "@topostack/data-contracts/chart-bathymetry";

const INPUTS = ["pdf-vector", "pdf-raster", "png"];
const SHA256 = /^[a-f0-9]{64}$/;

function fail(id, message) {
  throw new Error(`Depth chart ${id ?? "(unnamed)"}: ${message}`);
}

/** Validates scripts/data/depth-charts.json and returns its charts. */
export function parseChartManifest(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.charts)) throw new Error("The depth chart manifest needs a charts list.");
  const seen = new Set();
  for (const chart of value.charts) {
    const id = chart?.id;
    if (typeof id !== "string" || !ID.test(id)) fail(id, "id must be 8-64 lowercase letters, digits, or dashes.");
    if (seen.has(id)) fail(id, "id is listed twice.");
    seen.add(id);
    if (typeof chart.title !== "string" || !chart.title.trim()) fail(id, "needs a title.");
    if (!chart.source || typeof chart.source.url !== "string" || !/^https:\/\//.test(chart.source.url) || !SHA256.test(chart.source.sha256 ?? "")) fail(id, "source needs an https url and a sha256 pin.");
    if (!CHART_ATTESTATIONS.includes(chart.license?.attestation)) fail(id, `license attestation must be one of ${CHART_ATTESTATIONS.join(", ")}.`);
    if (!INPUTS.includes(chart.input?.kind)) fail(id, `input kind must be one of ${INPUTS.join(", ")}.`);
    if (!["m", "ft", "fathom"].includes(chart.units)) fail(id, "units must be m, ft, or fathom.");
    const trace = chart.trace ?? {};
    if (!["depth", "elevation"].includes(trace.labels)) fail(id, "trace.labels must be depth or elevation.");
    if (trace.labels === "elevation" && typeof trace.surface !== "number") fail(id, "elevation labels need trace.surface.");
    if (chart.input.kind === "pdf-vector" && (!Array.isArray(trace.contourStyles) || !trace.contourStyles.length)) fail(id, "vector charts need trace.contourStyles.");
    const points = chart.georef?.controlPoints;
    if (!Array.isArray(points) || points.length < 3) fail(id, "georef needs at least three control points.");
    const projected = typeof chart.georef.crs === "string";
    for (const point of points) {
      const ground = projected ? [point.easting, point.northing] : [point.lon, point.lat];
      if (![point.x, point.y, ...ground].every(Number.isFinite)) fail(id, projected ? "control points need x, y, easting, northing." : "control points need x, y, lon, lat.");
    }
    const water = chart.water ?? {};
    if (!("fillStyles" in water) && !("shoreLevel" in water) && water.fromShoreline !== true) fail(id, "water needs fillStyles (vector), fromShoreline, or shoreLevel (traced shore).");
    if (water.fromShoreline === true && !Array.isArray(trace.shorelineStyles)) fail(id, "water.fromShoreline needs trace.shorelineStyles.");
    if (!(chart.grid?.resolutionM > 0)) fail(id, "grid.resolutionM must be positive.");
  }
  return value.charts;
}

/** Control points on the ground; projected ones (from a chart's grid ticks) convert with proj4. */
export function controlPoints(georef) {
  return georef.controlPoints.map((point) => {
    if (!georef.crs) return { x: point.x, y: point.y, lon: point.lon, lat: point.lat };
    const [lon, lat] = proj4(georef.crs, "WGS84", [point.easting, point.northing]);
    return { x: point.x, y: point.y, lon, lat };
  });
}

/** Traces a chart page (vector) or image (raster) with the manifest's options, in page or pixel units. */
export function traceChart(chart, input) {
  const trace = chart.trace;
  const common = {
    labels: trace.labels,
    ...(trace.surface === undefined ? {} : { surface: trace.surface }),
    ...(trace.interval === undefined ? {} : { interval: trace.interval }),
    ...(trace.mapArea ? { mapArea: trace.mapArea } : {}),
  };
  if (chart.input.kind === "pdf-vector") {
    const page = input.page;
    const words = (trace.words ?? []).map((word) => ({ text: word.text, x: (word.left + word.right) / 2, y: (word.top + word.bottom) / 2, angle: word.angle ?? Number.NaN, size: word.bottom - word.top, width: word.right - word.left }));
    const result = traceVectorChart({ ...page, texts: [...page.texts, ...words] }, { ...common, contourStyles: trace.contourStyles, ...(trace.shorelineStyles ? { shorelineStyles: trace.shorelineStyles } : {}) });
    // Some charts draw the waterline itself (a "water surface elevation" line)
    // rather than filling the lake; then the traced shoreline is the outline.
    if (chart.water.fromShoreline) return { ...result, water: result.shoreline.filter((ring) => ring.length >= 3) };
    const fills = new Set(chart.water.fillStyles ?? []);
    const area = trace.mapArea;
    // The legend repeats the water fill as a swatch; only fills on the map count.
    const onMap = (points) => !area || points.filter(([x, y]) => x >= area.left && x <= area.right && y >= area.top && y <= area.bottom).length * 2 >= points.length;
    const water = fills.size ? page.paths.filter((path) => path.fill && !path.stroke && fills.has(path.fill) && path.points.length >= 3 && onMap(path.points)).map((path) => path.points) : [];
    return { ...result, water };
  }
  const result = traceRasterChart(input.image, { ...common, ...(trace.words ? { words: trace.words } : {}), ...(trace.shoreline ? { shoreline: trace.shoreline } : {}) });
  return { ...result, water: [] };
}

/**
 * The record for one traced chart. The assembly itself lives in
 * `@topostack/chart-trace/record`, shared with the studio's tracing wizard, so
 * a curated chart and an uploaded one mean the same thing.
 */
export function chartRecord(chart, traced, { fileSha256, tool }) {
  const points = controlPoints(chart.georef);
  const fit = fitControlPoints(points, chart.georef.model);
  const unit = CHART_UNIT_METRES[chart.units];
  const labels = chart.trace.labels === "depth"
    ? { kind: "depth" }
    : { kind: "elevation", surfaceElevationM: chart.trace.surface * unit, ...(chart.trace.datum ? { datum: chart.trace.datum } : {}) };
  // The chart's own water: its fills, or the lines it drew at the shore level.
  const surfaceLines = chart.water.shoreLevel === undefined
    ? []
    : traced.contours.filter((contour) => contour.points.length >= 3 && Math.abs(contour.value - chart.water.shoreLevel) < 1e-9).map((contour) => contour.points);
  const { record, report } = buildChartRecord({
    id: chart.id,
    lake: {
      name: chart.lake?.name ?? chart.title,
      ...(chart.lake?.region ? { region: chart.lake.region } : {}),
      ...(chart.lake?.hylakId ? { hylakId: chart.lake.hylakId } : {}),
    },
    georef: { matrix: fit.matrix, rmsM: fit.rmsM, method: "control-points", controlPoints: points },
    units: chart.units,
    labels,
    interval: traced.interval ?? chart.trace.interval,
    contours: traced.contours,
    water: { pixels: traced.water.length ? traced.water : surfaceLines },
    resolutionM: chart.grid.resolutionM,
    ...(chart.grid.method ? { method: chart.grid.method } : {}),
    provenance: {
      title: chart.title,
      ...(chart.publisher ? { publisher: chart.publisher } : {}),
      sourceUrl: chart.source.url,
      ...(chart.year ? { year: chart.year } : {}),
      fileSha256,
      tool,
    },
    license: chart.license,
  });
  return {
    record,
    report: {
      id: chart.id,
      publishable: report.publishable,
      georefRmsM: report.georefRmsM,
      contours: report.contours,
      contourPoints: report.contourPoints,
      labelled: traced.diagnostics.labelled,
      inferred: traced.diagnostics.inferred,
      coverage: Math.round(traced.diagnostics.coverage * 1000) / 1000,
      grid: `${report.grid.width}x${report.grid.height} at ${report.grid.resolutionM.toFixed(1)} m`,
      waterCells: report.waterCells,
      deepestM: report.deepestM,
    },
  };
}
