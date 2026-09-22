// Curated depth charts to UserChartBathymetryV1 records. The pure half of
// scripts/data-build/trace-depth-charts.mjs: manifest validation, control
// points, and trace -> georeference -> grid -> record, testable without
// downloads or external tools.

import proj4 from "proj4";
import { apply, fitControlPoints } from "@topostack/chart-trace/georef";
import { gridDepths } from "@topostack/chart-trace/grid";
import { traceRasterChart, simplify } from "@topostack/chart-trace/trace-raster";
import { traceVectorChart } from "@topostack/chart-trace/trace-vector";
import { CHART_ATTESTATIONS, CHART_BATHYMETRY_LIMITS, CHART_BATHYMETRY_SCHEMA, CHART_ID_PATTERN as ID, CHART_UNIT_METRES, chartLabelDepthM, encodeChartDepths, isPublishableChart, parseUserChartBathymetry } from "@topostack/data-contracts/chart-bathymetry";

const INPUTS = ["pdf-vector", "pdf-raster", "png"];
const SHA256 = /^[a-f0-9]{64}$/;

/** At most `limit` contours, the longest, in the order they came. */
function longestContours(contours, limit) {
  if (contours.length <= limit) return contours;
  const kept = new Set([...contours].sort((left, right) => right.points.length - left.points.length).slice(0, limit));
  return contours.filter((contour) => kept.has(contour));
}

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

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[(index + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/**
 * The record for one traced chart: contours and water georeferenced into
 * lon/lat, labels converted to depths in metres, contours simplified to fit
 * the contract, and the depth grid interpolated from them.
 */
export function chartRecord(chart, traced, { fileSha256, tool }) {
  const fit = fitControlPoints(controlPoints(chart.georef), chart.georef.model);
  // Six decimals is about 0.1 m, far finer than any chart's line width, and
  // keeps a record with tens of thousands of points to a sane file size.
  const toLonLat = ([x, y]) => apply(fit.matrix, x, y).map((value) => Math.round(value * 1e6) / 1e6);
  // Ground metres per page unit near the page origin, to size simplification in ground terms.
  const [lon0, lat0] = toLonLat([0, 0]);
  const [lon1, lat1] = toLonLat([1, 0]);
  const metresPerUnit = Math.hypot((lon1 - lon0) * 111_320 * Math.cos((lat0 * Math.PI) / 180), (lat1 - lat0) * 110_574);
  const unit = CHART_UNIT_METRES[chart.units];
  const labels = chart.trace.labels === "depth" ? { kind: "depth" } : { kind: "elevation", surfaceElevationM: chart.trace.surface * unit, ...(chart.trace.datum ? { datum: chart.trace.datum } : {}) };
  // Keep the longest lines, in their own order, when a noisy scan yields more
  // than a record holds. Capping first also bounds the loop below: every line
  // keeps at least two points, and the cap's two points each fit the budget.
  const leveled = longestContours(traced.contours
    .map((contour) => ({ ...contour, depthM: chartLabelDepthM(labels, contour.value * unit) }))
    .filter((contour) => contour.depthM >= 0 && contour.points.length >= 2), CHART_BATHYMETRY_LIMITS.maxContours);
  if (!leveled.length) throw new Error(`Depth chart ${chart.id}: no contour got a level; add labels (trace.words) or check the styles.`);
  // Simplify until the contours fit the contract's point budget.
  let tolerance = chart.grid.resolutionM / 4 / metresPerUnit;
  let contours;
  for (;;) {
    contours = leveled.map((contour) => ({ depthM: Math.round(contour.depthM * 1000) / 1000, closed: contour.closed, line: simplify(contour.points, tolerance).map(toLonLat) }));
    if (contours.reduce((sum, contour) => sum + contour.line.length, 0) <= CHART_BATHYMETRY_LIMITS.maxContourPoints) break;
    tolerance *= 1.5;
  }
  contours = contours.filter((contour) => contour.line.length >= 2);

  const surfaceLines = chart.water.shoreLevel === undefined ? [] : traced.contours.filter((contour) => contour.points.length >= 3 && Math.abs(contour.value - chart.water.shoreLevel) < 1e-9).map((contour) => contour.points);
  // The shore is drawn at the same scale as the contours, so it simplifies the same way.
  const waterRings = (traced.water.length ? traced.water : surfaceLines).map((ring) => simplify(ring, tolerance).map(toLonLat)).filter((ring) => ring.length >= 3);
  if (!waterRings.length) throw new Error(`Depth chart ${chart.id}: no water outline; set water.fillStyles or water.shoreLevel.`);
  const grid = gridDepths({
    water: { rings: waterRings },
    contours: contours.map((contour) => ({ depthM: contour.depthM, line: contour.line, closed: contour.closed })),
    resolutionM: chart.grid.resolutionM,
    method: chart.grid.method ?? "harmonic",
    intervalM: (traced.interval ?? chart.trace.interval) * unit,
  });
  // The lake outline in the record: the largest water ring, thinned to the contract's limit.
  const largest = [...waterRings].sort((a, b) => ringArea(b) - ringArea(a))[0];
  let outline = largest;
  for (let step = 2; outline.length > CHART_BATHYMETRY_LIMITS.maxOutlinePoints; step += 1) outline = largest.filter((_, index) => index % step === 0);

  const record = {
    schema: CHART_BATHYMETRY_SCHEMA,
    id: chart.id,
    lake: { name: chart.lake?.name ?? chart.title, ...(chart.lake?.hylakId ? { hylakId: chart.lake.hylakId } : {}), outline: outline.length >= 4 ? outline : [...outline, outline[0]] },
    georef: { method: "control-points", matrix: fit.matrix, controlPoints: controlPoints(chart.georef), rmsM: Math.round(fit.rmsM * 100) / 100 },
    units: chart.units,
    labels,
    intervalM: (traced.interval ?? chart.trace.interval) * unit,
    contours,
    spots: [],
    grid: { bounds: grid.bounds, width: grid.width, height: grid.height, method: grid.method, depthsDm: encodeChartDepths(grid.depthsM) },
    provenance: {
      title: chart.title,
      ...(chart.publisher ? { publisher: chart.publisher } : {}),
      sourceUrl: chart.source.url,
      ...(chart.year ? { year: chart.year } : {}),
      fileSha256,
      tool,
    },
    license: chart.license,
  };
  const parsed = parseUserChartBathymetry(record);
  let deepest = 0;
  let covered = 0;
  for (const depth of grid.depthsM) {
    if (Number.isNaN(depth)) continue;
    covered += 1;
    deepest = Math.max(deepest, depth);
  }
  const report = {
    id: chart.id,
    publishable: isPublishableChart(parsed),
    georefRmsM: parsed.georef.rmsM,
    contours: parsed.contours.length,
    contourPoints: parsed.contours.reduce((sum, contour) => sum + contour.line.length, 0),
    labelled: traced.diagnostics.labelled,
    inferred: traced.diagnostics.inferred,
    coverage: Math.round(traced.diagnostics.coverage * 1000) / 1000,
    grid: `${grid.width}x${grid.height} at ${grid.resolutionM.toFixed(1)} m`,
    waterCells: covered,
    deepestM: Math.round(deepest * 10) / 10,
  };
  return { record: parsed, report };
}

