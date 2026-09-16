import type { GeoBounds, WaterAreaV1 } from "@topostack/core";
import { createArchive } from "./archive";
import { decodeTerrainPng } from "./terrain-png";
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
export function sampleDepth(sample: (x: number, y: number) => number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let depth = 0;
  for (const [dx, dy, weight] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    if (weight! <= 1e-10) continue;
    const value = sample(x0 + dx!, y0 + dy!);
    if (!Number.isFinite(value) || value < 0 || value > 1500) return Number.NaN;
    depth += value * weight!;
  }
  return depth;
}

/** Fetch a bounded tile window and align positive-down depths to the DEM's sample locations. */
export async function loadNoaaBathymetry(apiBase: string, bounds: GeoBounds, width: number, height: number, requestedZoom: number, areas: WaterAreaV1[], signal?: AbortSignal): Promise<{ areas: WaterAreaV1[]; status: "available" | "unavailable" | "not-covered" }> {
  signal?.throwIfAborted();
  if (!areas.some(hasNoaaCoverage)) return { areas, status: "not-covered" };
  try {
    const archive = createArchive(`${apiBase}/v1/bathymetry/${catalog.dataset}.pmtiles`, signal);
    const header = await archive.getHeader();
    if (header.tileType !== 2 || header.minZoom !== 0 || header.maxZoom !== catalog.maxZoom) throw new Error("Unexpected NOAA archive format.");
    const metadata = await archive.getMetadata() as Record<string, unknown>;
    if (metadata.topostack_encoding !== "depth-terrarium-v1" || metadata.topostack_dataset !== catalog.dataset) throw new Error("Unexpected NOAA depth encoding.");
    let z = Math.max(0, Math.min(catalog.maxZoom, Math.round(requestedZoom)));
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
            for (const value of values) if (!Number.isNaN(value) && (!Number.isFinite(value) || value < 0 || value > 1500)) throw new Error("Invalid NOAA depth.");
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
        const depth = sampleDepth(sample, west + spanX * column / (width - 1) - 0.5, north + spanY * row / (height - 1) - 0.5);
        depthsM[row * width + column] = depth;
        if (Number.isFinite(depth)) covered = true;
      }
    }
    if (!covered) return { areas, status: "not-covered" };
    const bathymetry = { width, height, depthsM };
    return { areas: areas.map((area) => hasNoaaCoverage(area) ? { ...area, bathymetry } : area), status: "available" };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { areas, status: "unavailable" };
  }
}
