// A lake depth chart traced into bathymetry: the studio saves these locally,
// the batch pipeline emits them for curated public charts, and the Worker
// accepts them as reviewed catalog submissions. The traced contours are the
// source of truth; the grid is derived from them and can be regenerated.
// Everything here is JSON-safe so one record serves IndexedDB, project files,
// submission bodies, and the files the batch build commits.

export const CHART_BATHYMETRY_SCHEMA = "chart-bathymetry-v1";
export const CHART_UNITS = ["m", "ft", "fathom"] as const;
export type ChartUnit = typeof CHART_UNITS[number];
export const CHART_GEOREF_METHODS = ["snap", "control-points"] as const;
export type ChartGeorefMethod = typeof CHART_GEOREF_METHODS[number];
export const CHART_GRID_METHODS = ["harmonic", "tin"] as const;
export type ChartGridMethod = typeof CHART_GRID_METHODS[number];
/** What the person saving the chart states about their right to use it. Only the first three may be published. */
export const CHART_ATTESTATIONS = ["own-work", "public-domain", "open-license", "personal-use"] as const;
export type ChartAttestation = typeof CHART_ATTESTATIONS[number];

/** Metres per chart unit. */
export const CHART_UNIT_METRES: Record<ChartUnit, number> = { m: 1, ft: 0.3048, fathom: 1.8288 };

/** Grid depths are stored in decimetres; this marks a cell the chart does not cover. */
export const CHART_NO_DEPTH = 0xffff;

export const CHART_BATHYMETRY_LIMITS = {
  maxDepthM: 1500,
  maxIntervalM: 500,
  maxGridSide: 1024,
  maxContours: 5000,
  maxContourPoints: 200_000,
  maxSpots: 5000,
  maxOutlinePoints: 20_000,
  maxControlPoints: 64,
  title: 200,
  publisher: 200,
  note: 500,
} as const;

/** [lon, lat] in WGS84 degrees. */
export type ChartLonLat = [number, number];

export interface ChartContourV1 {
  depthM: number;
  line: ChartLonLat[];
  /** True when the line closes on itself or on the shoreline. */
  closed: boolean;
}

export interface ChartSpotV1 {
  lon: number;
  lat: number;
  depthM: number;
}

export interface ChartControlPointV1 {
  /** Chart image pixel, origin top-left. */
  x: number;
  y: number;
  lon: number;
  lat: number;
}

export interface ChartGridV1 {
  bounds: { west: number; south: number; east: number; north: number };
  width: number;
  height: number;
  method: ChartGridMethod;
  /** Base64 of little-endian uint16 decimetres, row-major from the north-west corner; CHART_NO_DEPTH marks no coverage. */
  depthsDm: string;
}

export type ChartLabelsV1 =
  | { kind: "depth" }
  | { kind: "elevation"; surfaceElevationM: number; datum?: string };

export interface UserChartBathymetryV1 {
  schema: typeof CHART_BATHYMETRY_SCHEMA;
  id: string;
  lake: { name?: string; hylakId?: number; outline: ChartLonLat[] };
  georef: {
    method: ChartGeorefMethod;
    /** Row-major 3x3 homography from chart pixels to [lon, lat, 1]. */
    matrix: number[];
    controlPoints?: ChartControlPointV1[];
    /** Residual of the fit on the ground. */
    rmsM: number;
    /** Overlap between the traced shoreline and the known lake outline after snapping. */
    iou?: number;
  };
  units: ChartUnit;
  /**
   * How the chart labels its contours. Reservoir charts often print
   * elevations above a datum; those are converted to depths below
   * `surfaceElevationM` before they are stored, and this records how.
   */
  labels: ChartLabelsV1;
  intervalM: number;
  contours: ChartContourV1[];
  spots: ChartSpotV1[];
  grid: ChartGridV1;
  provenance: { title: string; publisher?: string; sourceUrl?: string; year?: number; fileSha256: string; tool: string };
  license: { attestation: ChartAttestation; spdx?: string; note?: string };
}

type Json = Record<string, unknown>;

function fail(message: string): never {
  throw new Error(`Invalid depth chart: ${message}`);
}

function record(value: unknown, name: string, allowed: readonly string[]): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object.`);
  const extra = Object.keys(value).find((key) => !allowed.includes(key));
  if (extra) fail(`${name} has an unknown field ${extra}.`);
  return value as Json;
}

function finite(value: unknown, name: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) fail(`${name} must be between ${minimum} and ${maximum}.`);
  return value;
}

function text(value: unknown, name: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) fail(`${name} must be text of at most ${maximum} characters.`);
  return value.trim();
}

function optional<T>(value: unknown, read: (value: unknown) => T): T | undefined {
  return value === undefined ? undefined : read(value);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], name: string): T {
  if (!options.includes(value as T)) fail(`${name} must be one of ${options.join(", ")}.`);
  return value as T;
}

function list(value: unknown, name: string, maximum: number, minimum = 0): unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) fail(`${name} must list between ${minimum} and ${maximum} entries.`);
  return value;
}

function lonLat(value: unknown, name: string): ChartLonLat {
  if (!Array.isArray(value) || value.length !== 2) fail(`${name} must be a [lon, lat] pair.`);
  return [finite(value[0], `${name} longitude`, -180, 180), finite(value[1], `${name} latitude`, -90, 90)];
}

function assertBounds(a: ChartGridV1["bounds"]): void {
  if (!(a.west < a.east && a.south < a.north)) fail("grid bounds must have west < east and south < north.");
}

export function encodeChartDepths(depthsM: ArrayLike<number>): string {
  const bytes = new Uint8Array(depthsM.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < depthsM.length; index += 1) {
    const depth = depthsM[index]!;
    const stored = Number.isFinite(depth) ? Math.min(CHART_NO_DEPTH - 1, Math.max(0, Math.round(depth * 10))) : CHART_NO_DEPTH;
    view.setUint16(index * 2, stored, true);
  }
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  return btoa(binary);
}

/** Grid depths in metres; NaN where the chart has no coverage. */
export function decodeChartDepths(grid: Pick<ChartGridV1, "width" | "height" | "depthsDm">): Float32Array {
  let binary: string;
  try {
    binary = atob(grid.depthsDm);
  } catch {
    fail("grid depths are not base64.");
  }
  const cells = grid.width * grid.height;
  if (binary.length !== cells * 2) fail(`grid depths hold ${binary.length / 2} cells, expected ${cells}.`);
  const depths = new Float32Array(cells);
  for (let index = 0; index < cells; index += 1) {
    const stored = binary.charCodeAt(index * 2) | (binary.charCodeAt(index * 2 + 1) << 8);
    depths[index] = stored === CHART_NO_DEPTH ? Number.NaN : stored / 10;
  }
  return depths;
}

function parseGrid(value: unknown): ChartGridV1 {
  const r = record(value, "grid", ["bounds", "width", "height", "method", "depthsDm"]);
  const b = record(r.bounds, "grid bounds", ["west", "south", "east", "north"]);
  const bounds = {
    west: finite(b.west, "grid west", -180, 180), south: finite(b.south, "grid south", -90, 90),
    east: finite(b.east, "grid east", -180, 180), north: finite(b.north, "grid north", -90, 90),
  };
  assertBounds(bounds);
  const side = CHART_BATHYMETRY_LIMITS.maxGridSide;
  if (!Number.isInteger(r.width) || !Number.isInteger(r.height)) fail("grid width and height must be whole numbers.");
  const width = finite(r.width, "grid width", 2, side);
  const height = finite(r.height, "grid height", 2, side);
  if (typeof r.depthsDm !== "string") fail("grid depths must be a base64 string.");
  const grid: ChartGridV1 = { bounds, width, height, method: oneOf(r.method, CHART_GRID_METHODS, "grid method"), depthsDm: r.depthsDm };
  const depths = decodeChartDepths(grid);
  let covered = 0;
  for (const depth of depths) {
    if (Number.isNaN(depth)) continue;
    if (depth > CHART_BATHYMETRY_LIMITS.maxDepthM) fail(`grid depths must not exceed ${CHART_BATHYMETRY_LIMITS.maxDepthM} m.`);
    covered += 1;
  }
  if (!covered) fail("grid covers no cells.");
  return grid;
}

/** Returns a normalized copy of a stored or submitted chart, or throws naming the first field out of contract. */
export function parseUserChartBathymetry(value: unknown): UserChartBathymetryV1 {
  const limits = CHART_BATHYMETRY_LIMITS;
  const r = record(value, "chart", ["schema", "id", "lake", "georef", "units", "labels", "intervalM", "contours", "spots", "grid", "provenance", "license"]);
  if (r.schema !== CHART_BATHYMETRY_SCHEMA) fail(`schema must be ${CHART_BATHYMETRY_SCHEMA}.`);
  if (typeof r.id !== "string" || !/^[a-z0-9][a-z0-9-]{7,63}$/.test(r.id)) fail("id must be 8-64 lowercase letters, digits, or dashes.");

  const lakeRecord = record(r.lake, "lake", ["name", "hylakId", "outline"]);
  const outline = list(lakeRecord.outline, "lake outline", limits.maxOutlinePoints, 4).map((point, index) => lonLat(point, `lake outline point ${index}`));
  const hylakId = optional(lakeRecord.hylakId, (id) => {
    if (!Number.isSafeInteger(id) || (id as number) <= 0) fail("lake hylakId must be a positive whole number.");
    return id as number;
  });
  const name = optional(lakeRecord.name, (item) => text(item, "lake name", limits.title));

  const g = record(r.georef, "georef", ["method", "matrix", "controlPoints", "rmsM", "iou"]);
  const matrix = list(g.matrix, "georef matrix", 9, 9).map((item, index) => finite(item, `georef matrix entry ${index}`, -Number.MAX_VALUE, Number.MAX_VALUE));
  const method = oneOf(g.method, CHART_GEOREF_METHODS, "georef method");
  const controlPoints = optional(g.controlPoints, (points) => list(points, "control points", limits.maxControlPoints, 3).map((point, index) => {
    const p = record(point, `control point ${index}`, ["x", "y", "lon", "lat"]);
    return {
      x: finite(p.x, `control point ${index} x`, 0, Number.MAX_SAFE_INTEGER), y: finite(p.y, `control point ${index} y`, 0, Number.MAX_SAFE_INTEGER),
      lon: finite(p.lon, `control point ${index} longitude`, -180, 180), lat: finite(p.lat, `control point ${index} latitude`, -90, 90),
    };
  }));
  if (method === "control-points" && !controlPoints) fail("control-point georeferencing must list its control points.");
  const iou = optional(g.iou, (item) => finite(item, "georef iou", 0, 1));

  const labelRecord = record(r.labels, "labels", ["kind", "surfaceElevationM", "datum"]);
  const labelKind = oneOf(labelRecord.kind, ["depth", "elevation"] as const, "labels kind");
  let labels: ChartLabelsV1;
  if (labelKind === "depth") {
    if (labelRecord.surfaceElevationM !== undefined || labelRecord.datum !== undefined) fail("depth labels take no surface elevation or datum.");
    labels = { kind: "depth" };
  } else {
    const datum = optional(labelRecord.datum, (item) => text(item, "labels datum", 64));
    labels = { kind: "elevation", surfaceElevationM: finite(labelRecord.surfaceElevationM, "labels surfaceElevationM", -500, 9000), ...(datum ? { datum } : {}) };
  }

  let points = 0;
  const contours = list(r.contours, "contours", limits.maxContours, 1).map((item, index) => {
    const c = record(item, `contour ${index}`, ["depthM", "line", "closed"]);
    const line = list(c.line, `contour ${index} line`, limits.maxContourPoints, 2).map((point, at) => lonLat(point, `contour ${index} point ${at}`));
    points += line.length;
    if (typeof c.closed !== "boolean") fail(`contour ${index} closed must be true or false.`);
    return { depthM: finite(c.depthM, `contour ${index} depth`, 0, limits.maxDepthM), line, closed: c.closed };
  });
  if (points > limits.maxContourPoints) fail(`contours must hold at most ${limits.maxContourPoints} points in total.`);
  const spots = list(r.spots, "spots", limits.maxSpots).map((item, index) => {
    const s = record(item, `spot ${index}`, ["lon", "lat", "depthM"]);
    return { lon: finite(s.lon, `spot ${index} longitude`, -180, 180), lat: finite(s.lat, `spot ${index} latitude`, -90, 90), depthM: finite(s.depthM, `spot ${index} depth`, 0, limits.maxDepthM) };
  });

  const p = record(r.provenance, "provenance", ["title", "publisher", "sourceUrl", "year", "fileSha256", "tool"]);
  if (typeof p.fileSha256 !== "string" || !/^[a-f0-9]{64}$/.test(p.fileSha256)) fail("provenance fileSha256 must be a lowercase SHA-256 hex digest.");
  const sourceUrl = optional(p.sourceUrl, (url) => {
    if (typeof url !== "string" || url.length > 2000 || !/^https?:\/\/[^\s]+$/.test(url)) fail("provenance sourceUrl must be an http(s) URL.");
    return url;
  });
  const year = optional(p.year, (item) => {
    if (!Number.isInteger(item)) fail("provenance year must be a whole number.");
    return finite(item, "provenance year", 1800, 2200);
  });
  const publisher = optional(p.publisher, (item) => text(item, "provenance publisher", limits.publisher));

  const l = record(r.license, "license", ["attestation", "spdx", "note"]);
  const spdx = optional(l.spdx, (item) => {
    if (typeof item !== "string" || !/^[A-Za-z0-9.+-]{1,64}$/.test(item)) fail("license spdx must be an SPDX identifier.");
    return item;
  });
  const note = optional(l.note, (item) => text(item, "license note", limits.note));

  return {
    schema: CHART_BATHYMETRY_SCHEMA,
    id: r.id,
    lake: { ...(name ? { name } : {}), ...(hylakId === undefined ? {} : { hylakId }), outline },
    georef: {
      method, matrix, ...(controlPoints ? { controlPoints } : {}),
      rmsM: finite(g.rmsM, "georef rmsM", 0, 1_000_000), ...(iou === undefined ? {} : { iou }),
    },
    units: oneOf(r.units, CHART_UNITS, "units"),
    labels,
    intervalM: (() => {
      const interval = finite(r.intervalM, "intervalM", 0, limits.maxIntervalM);
      if (interval <= 0) fail("intervalM must be greater than 0.");
      return interval;
    })(),
    contours,
    spots,
    grid: parseGrid(r.grid),
    provenance: {
      title: text(p.title, "provenance title", limits.title),
      ...(publisher ? { publisher } : {}), ...(sourceUrl ? { sourceUrl } : {}), ...(year === undefined ? {} : { year }),
      fileSha256: p.fileSha256, tool: text(p.tool, "provenance tool", 64),
    },
    license: { attestation: oneOf(l.attestation, CHART_ATTESTATIONS, "license attestation"), ...(spdx ? { spdx } : {}), ...(note ? { note } : {}) },
  };
}

/** Depth in metres for a contour label already converted to metres; elevations above the surface come back negative. */
export function chartLabelDepthM(labels: ChartLabelsV1, labelM: number): number {
  return labels.kind === "depth" ? labelM : labels.surfaceElevationM - labelM;
}

/** Whether the attestation allows the chart to enter the public catalog. */
export function isPublishableChart(chart: Pick<UserChartBathymetryV1, "license">): boolean {
  return chart.license.attestation !== "personal-use";
}
