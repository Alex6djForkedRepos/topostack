import type { ElevationGrid, GeoBounds, ProjectConfigV1, SourceAttribution, SourceBundleV1, WaterAreaV1 } from "@topostack/core";
import { createArchive } from "./archive";
import { decodeTerrainPng } from "./terrain-png";
import registry from "../../../scripts/data/lake-bathymetry.json";
import catalog from "../../../scripts/data/noaa-great-lakes.json";

export const NOAA_DATASET_VERSION = catalog.dataset;
export const NOAA_ATTRIBUTION = {
  name: "NOAA NCEI Great Lakes Bathymetry",
  url: catalog.sourceUrl,
  license: "NOAA/NCEI — Great Lakes bathymetric grids; Lake Superior is a draft. " + catalog.lakes.flatMap((lake) => lake.doi ? [lake.doi] : []).join("; "),
};
const names = new Set(catalog.lakes.flatMap((lake) => lake.names.map((name) => name.toLowerCase())));
const lakeIds = new Set(catalog.lakes.flatMap((lake) => lake.hylakIds));
export function hasNoaaCoverage(area: WaterAreaV1): boolean {
  return area.kind === "lake" && (area.hylakId === undefined
    ? names.has(area.name?.trim().toLowerCase() ?? "")
    : lakeIds.has(area.hylakId));
}
const worldX = (lon: number, z: number) => (lon + 180) / 360 * 256 * 2 ** z;
const worldY = (lat: number, z: number) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 256 * 2 ** z;

/** Interpolate only covered samples; a transparent neighbor never becomes a zero-depth shore. */
export function sampleDepth(sample: (x: number, y: number) => number, x: number, y: number, min = 0, max = 1500): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let depth = 0;
  for (const [dx, dy, weight] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    if (weight! <= 1e-10) continue;
    const value = sample(x0 + dx!, y0 + dy!);
    if (!Number.isFinite(value) || value < min || value > max) return Number.NaN;
    depth += value * weight!;
  }
  return depth;
}

/** Fetch a bounded tile window and align positive-down depths to the DEM's sample locations. */
async function loadRaster(apiBase: string, bounds: GeoBounds, width: number, height: number, requestedZoom: number, areas: WaterAreaV1[], signal?: AbortSignal, dataset = registry.sources[0]!): Promise<{ areas: WaterAreaV1[]; status: "available" | "unavailable" | "not-covered" }> {
  signal?.throwIfAborted();
  if (!areas.length) return { areas, status: "not-covered" };
  try {
    const archive = createArchive(`${apiBase}/v1/bathymetry/${dataset.id}.pmtiles`, signal);
    const header = await archive.getHeader();
    if (header.tileType !== 2 || (!Number.isInteger(header.minZoom) || header.minZoom < 0 || header.minZoom > dataset.maxZoom) || header.maxZoom !== dataset.maxZoom) throw new Error("Unexpected survey archive format.");
    const metadata = await archive.getMetadata() as Record<string, unknown>;
    if (metadata.topostack_encoding !== dataset.encoding || metadata.topostack_dataset !== dataset.id) throw new Error("Unexpected survey depth encoding.");
    let z = Math.max(0, Math.min(dataset.maxZoom, Math.round(requestedZoom)));
    // Include the neighboring pixel at the crop boundary for bilinear sampling.
    const tileBounds = () => ({
      left: Math.max(0, Math.floor((worldX(bounds.west, z) - 0.5) / 256)),
      right: Math.min(2 ** z - 1, Math.floor((worldX(bounds.east, z) + 0.5) / 256)),
      top: Math.max(0, Math.floor((worldY(bounds.north, z) - 0.5) / 256)),
      bottom: Math.min(2 ** z - 1, Math.floor((worldY(bounds.south, z) + 0.5) / 256)),
    });
    let window = tileBounds();
    while ((window.right - window.left + 1) * (window.bottom - window.top + 1) > 24 && z > 0) { z -= 1; window = tileBounds(); }
    const tiles = new Map<string, Float32Array>();
    const requests: Array<Promise<void>> = [];
    for (let y = window.top; y <= window.bottom; y += 1) {
      for (let x = window.left; x <= window.right; x += 1) {
        requests.push((async () => {
          const tile = await archive.getZxy(z, x, y, signal);
          signal?.throwIfAborted();
          if (tile) {
            const values = decodeTerrainPng(new Uint8Array(tile.data), true);
            for (let i = 0; i < values.length; i += 1) {
              const value = values[i]!;
              if (Number.isNaN(value)) continue;
              if (!Number.isFinite(value) || (dataset.encoding === "elevation-terrarium-v1" ? value < -500 || value > 9000 : value < 0 || value > 1500)) throw new Error("Invalid survey sample.");
            }
            tiles.set(`${x}/${y}`, values);
          }
        })());
      }
    }
    await Promise.all(requests);
    const sample = (x: number, y: number) => tiles.get(`${Math.floor(x / 256)}/${Math.floor(y / 256)}`)?.[(y % 256) * 256 + x % 256] ?? Number.NaN;
    const depthsM = new Float32Array(width * height);
    let covered = false;
    const west = worldX(bounds.west, z), north = worldY(bounds.north, z);
    const spanX = worldX(bounds.east, z) - west, spanY = worldY(bounds.south, z) - north;
    for (let row = 0; row < height; row += 1) {
      signal?.throwIfAborted();
      for (let column = 0; column < width; column += 1) {
        const depth = sampleDepth(sample, west + spanX * column / (width - 1) - 0.5, north + spanY * row / (height - 1) - 0.5, dataset.encoding === "elevation-terrarium-v1" ? -500 : 0, dataset.encoding === "elevation-terrarium-v1" ? 9000 : 1500);
        depthsM[row * width + column] = depth;
        if (Number.isFinite(depth)) covered = true;
      }
    }
    if (!covered) return { areas, status: "not-covered" };
    const bathymetry = { width, height, depthsM };
    return { areas: areas.map((area) => ({ ...area, bathymetry })), status: "available" };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { areas, status: "unavailable" };
  }
}

/** Legacy single-provider entry point, retained for the NOAA archive verifier. */
export async function loadNoaaBathymetry(apiBase: string, bounds: GeoBounds, width: number, height: number, zoom: number, areas: WaterAreaV1[], signal?: AbortSignal) {
  const matching = areas.filter(hasNoaaCoverage);
  if (!matching.length) return { areas, status: "not-covered" as const };
  const result = await loadRaster(apiBase, bounds, width, height, zoom, matching, signal);
  return { ...result, areas: areas.map((area) => result.areas.find((item) => item.id === area.id) ?? area) };
}

const intersects = (bounds: GeoBounds, extent: number[]) => bounds.east > extent[0]! && bounds.west < extent[2]! && bounds.north > extent[1]! && bounds.south < extent[3]!;
export function hasSurveyCoverage(bounds: GeoBounds, area: WaterAreaV1): boolean {
  return area.kind === "lake" && registry.sources.some((source) => intersects(bounds, source.bounds) && (source.id !== NOAA_DATASET_VERSION || hasNoaaCoverage(area)));
}

function insideRing(x: number, y: number, ring: WaterAreaV1["polygon"]["outer"]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export interface SurveyResult {
  areas: WaterAreaV1[];
  status: "available" | "partial" | "unavailable" | "not-covered";
  datasetVersions: string[];
  attribution: SourceAttribution[];
}

/** Load only intersecting providers. A failed provider cannot erase another provider's data. */
export async function loadLakeBathymetry(apiBase: string, bounds: GeoBounds, grid: ElevationGrid, zoom: number, areas: WaterAreaV1[], signal?: AbortSignal, dimensions?: Pick<ProjectConfigV1, "widthMm" | "heightMm">): Promise<SurveyResult> {
  signal?.throwIfAborted();
  let merged = areas.map((area) => { const copy = { ...area }; delete copy.bathymetry; return copy; });
  const datasetVersions: string[] = [], attribution: SourceAttribution[] = [];
  let failed = false;
  for (const dataset of registry.sources) {
    if (!intersects(bounds, dataset.bounds)) continue;
    const matching = merged.filter((area) => area.kind === "lake" && (dataset.id !== NOAA_DATASET_VERSION || hasNoaaCoverage(area)));
    if (!matching.length) continue;
    let used = false;
    {
      const result = await loadRaster(apiBase, bounds, grid.width, grid.height, zoom, matching, signal, dataset);
      if (result.status === "unavailable") { failed = true; continue; }
      if (result.status !== "available") continue;
      for (const area of result.areas) {
        if (dataset.encoding === "elevation-terrarium-v1" && !Number.isFinite(area.surfaceElevationM)) { failed = true; continue; }
        const values = area.bathymetry!.depthsM;
        const previous = merged.find((item) => item.id === area.id)!;
        // Ignore samples outside this lake, including islands and neighboring lakes.
        const samples = Float32Array.from(previous.bathymetry?.depthsM ?? new Float32Array(values.length).fill(Number.NaN));
        let count = 0;
        for (let row = 0; row < grid.height; row += 1) {
          signal?.throwIfAborted();
          for (let col = 0; col < grid.width; col += 1) {
            const index = row * grid.width + col;
            if (!Number.isFinite(values[index])) continue;
            if (dimensions) {
              const x = (col / (grid.width - 1) - 0.5) * dimensions.widthMm;
              const y = (row / (grid.height - 1) - 0.5) * dimensions.heightMm;
              if (!insideRing(x, y, area.polygon.outer) || area.polygon.holes.some((ring) => insideRing(x, y, ring))) continue;
            }
            const depth = dataset.encoding === "elevation-terrarium-v1" ? area.surfaceElevationM! - values[index]! : values[index]!;
            if (depth < 0 || depth > 1500) continue;
            // First provider wins; later providers only fill gaps.
            if (!Number.isFinite(samples[index])) { samples[index] = depth; count += 1; }
          }
        }
        if (count) {
          used = true;
          merged = merged.map((item) => item.id === area.id ? { ...item, bathymetry: { width: grid.width, height: grid.height, depthsM: samples } } : item);
        }
      }
    }
    if (used) {
      datasetVersions.push(dataset.id);
      attribution.push(dataset.id === NOAA_DATASET_VERSION ? NOAA_ATTRIBUTION : { name: dataset.name, url: dataset.url, license: dataset.license });
    }
  }
  return { areas: merged, status: datasetVersions.length ? failed ? "partial" : "available" : failed ? "unavailable" : "not-covered", datasetVersions, attribution };
}

/** Replace previous survey provenance on retries so failed loads cannot retain stale claims. */
export function applySurveyProvenance(source: SourceBundleV1, result: SurveyResult): SourceBundleV1 {
  const ids = new Set(registry.sources.map((item) => item.id));
  const names = new Set(registry.sources.map((item) => item.name));
  return { ...source, bathymetryStatus: result.status,
    datasetVersion: [...source.datasetVersion.split("+").filter((id) => !ids.has(id)), ...result.datasetVersions].join("+"),
    attribution: [...source.attribution.filter((item) => !names.has(item.name)), ...result.attribution] };
}
