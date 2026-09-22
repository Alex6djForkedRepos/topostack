import { DEFAULT_PROJECT, type GeoBounds, type WaterAreaV1 } from "@topostack/core";
import { loadLakeAreas, type PlaceResult } from "$lib/domain/data-provider";
import { artworkToLonLat } from "$lib/domain/tile-math";

/**
 * Finding a lake to chart, by name, without generating anything.
 *
 * Tracing a depth chart is its own job: a maker may do it long before they
 * frame a map or press Generate. So a lake is found the same way a place is —
 * search, then pick — and its outline comes straight from the water data the
 * studio already loads, not from a generated project.
 */

export interface ChartableLake {
  id: string;
  name: string;
  /** Lakes are keyed by HydroLAKES id everywhere a project refers to one. */
  hylakId: number;
  /** The shore in [lon, lat], which is what a chart is snapped onto. */
  outline: [number, number][];
  /** Rough footprint in square degrees, so the biggest lake sorts first. */
  footprint: number;
  /** How far across the lake runs, west to east and south to north, in kilometres. */
  spanKm: [number, number];
  /** How far the lake's middle lies from the searched place, in kilometres. */
  distanceKm: number;
}

/**
 * How wide a window around a searched place is scanned for lakes. Wide enough
 * that naming the town beside a lake finds it: a place result lands on the town
 * centre, and a lake ten kilometres out is still the one that was meant.
 */
export const LAKE_WINDOW_DEG = 0.3;
const LAKE_WINDOW_ZOOM = 11;
/** The scratch canvas lake outlines arrive on; only its aspect matters. */
const WINDOW_MM = 200;
const MAX_LAKES = 12;

/** A square window around a place, wide enough to hold the lake it names. */
export function lakeWindow(lat: number, lon: number, spanDeg = LAKE_WINDOW_DEG): GeoBounds {
  const half = spanDeg / 2;
  // Longitude degrees shrink towards the poles; keep the window square on the ground.
  const lonHalf = half / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return { west: lon - lonHalf, east: lon + lonHalf, south: lat - half, north: lat + half };
}

/**
 * How big the lake is, in degrees and on the ground. HydroLAKES names only
 * some of its lakes, so size is often the only way to tell two apart in a list.
 */
function sizeOf(outline: readonly [number, number][]): { footprint: number; spanKm: [number, number] } {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const [lon, lat] of outline) {
    west = Math.min(west, lon); east = Math.max(east, lon);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  const midLat = ((south + north) / 2) * Math.PI / 180;
  return {
    footprint: (east - west) * (north - south),
    spanKm: [(east - west) * 111.32 * Math.cos(midLat), (north - south) * 110.57],
  };
}

/**
 * The lakes around a searched place, largest first. Only lakes with a
 * HydroLAKES id are offered, because that is how a project names the lake a
 * chart belongs to.
 */
export async function lakesNear(
  place: Pick<PlaceResult, "lat" | "lon">,
  signal?: AbortSignal,
  load: (bounds: GeoBounds, zoom: number, config: typeof DEFAULT_PROJECT, signal?: AbortSignal) => Promise<WaterAreaV1[]> = loadLakeAreas,
): Promise<ChartableLake[]> {
  const bounds = lakeWindow(place.lat, place.lon);
  const config = { ...DEFAULT_PROJECT, widthMm: WINDOW_MM, heightMm: WINDOW_MM, showWater: true, location: { ...DEFAULT_PROJECT.location, lat: place.lat, lon: place.lon, zoom: LAKE_WINDOW_ZOOM, bounds } };
  const areas = await load(bounds, LAKE_WINDOW_ZOOM, config, signal);
  const toLonLat = artworkToLonLat(bounds, WINDOW_MM, WINDOW_MM);
  return areas
    .filter((area) => area.kind === "lake" && area.hylakId !== undefined && area.polygon.outer.length >= 3)
    .map((area) => {
      const outline = area.polygon.outer.map(toLonLat);
      // Many lakes are unnamed in the water data, so how big it is and how far
      // off it lies are what let a maker pick the one they meant.
      const middle = outline.reduce(([sx, sy], [lon, lat]) => [sx + lon / outline.length, sy + lat / outline.length], [0, 0]);
      const distanceKm = Math.hypot((middle[0]! - place.lon) * 111.32 * Math.cos((place.lat * Math.PI) / 180), (middle[1]! - place.lat) * 110.57);
      return { id: area.id, name: area.name ?? "Unnamed lake", hylakId: area.hylakId!, outline, ...sizeOf(outline), distanceKm };
    })
    .sort((left, right) => right.footprint - left.footprint)
    .slice(0, MAX_LAKES);
}
