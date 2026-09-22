import { index as outlineIndex } from "../../../../../scripts/data/lake-outlines-release.json";
import type { GeoBounds, Polygon2D, ProjectConfigV1, WaterAreaV1 } from "@topostack/core";
import polygonClipping, { type MultiPolygon, type Pair } from "polygon-clipping";
import { networkSignal } from "$lib/domain/archive";
import { mapTiles } from "$lib/domain/tile-requests";
import { createFeatureBudget } from "$lib/domain/feature-budget";

type Bounds = [number, number, number, number];
interface OutlineFeature {
  bbox: Bounds;
  properties: { sourceId: string; surveyId: string; name: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: Pair[][] | Pair[][][] };
}
interface OutlineIndex { schemaVersion: number; shards: { file: string; bounds: Bounds; sourceId: string; count: number }[] }
const intersects = (b: GeoBounds, a: Bounds) => b.east > a[0] && b.west < a[2] && b.north > a[1] && b.south < a[3];
const mercatorY = (lat: number) => Math.asinh(Math.tan(lat * Math.PI / 180));
const input = (p: Polygon2D): MultiPolygon => [[p.outer.map(({ x, y }) => [x, y] as Pair), ...p.holes.map((ring) => ring.map(({ x, y }) => [x, y] as Pair))]];
const ringArea = (ring: Pair[]) => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const area = (polygons: MultiPolygon) => polygons.reduce((sum, rings) => sum + ringArea(rings[0]!) - rings.slice(1).reduce((n, ring) => n + ringArea(ring), 0), 0);
const polygon = (rings: Pair[][]): Polygon2D => ({ outer: rings[0]!.map(([x, y]) => ({ x, y })), holes: rings.slice(1).map((ring) => ring.map(([x, y]) => ({ x, y }))) });

/** Assets are spatially sharded and fetched only for the selected map window. */
export async function loadProviderOutlines(base: string, bounds: GeoBounds, config: Pick<ProjectConfigV1, "widthMm" | "heightMm" | "minimumFeatureMm">, signal?: AbortSignal): Promise<WaterAreaV1[]> {
  const read = async (file: string) => {
    const response = await fetch(`${base}/v1/lake-outlines/${file}`, { signal: networkSignal(signal) });
    if (!response.ok) throw new Error("Lake outlines could not be loaded.");
    return response.json();
  };
  signal?.throwIfAborted();
  const index = await read(outlineIndex.file) as OutlineIndex;
  if (index.schemaVersion !== 1 || !Array.isArray(index.shards)) throw new Error("Unknown lake outline index.");
  const shards = index.shards.filter((shard) => intersects(bounds, shard.bounds));
  if (shards.length > 64) throw new Error("Narrow the map area to load survey outlines.");
  const collections = await mapTiles(shards, async (shard) => {
    if (!/^[a-f0-9]{24}\.json$/.test(shard.file)) throw new Error("Invalid outline asset path.");
    return await read(shard.file) as { features: OutlineFeature[] };
  }, signal);
  const north = mercatorY(bounds.north), south = mercatorY(bounds.south);
  const project = ([lon, lat]: Pair): Pair => {
    if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) >= 85.1) throw new Error("Invalid shoreline coordinate.");
    return [((lon - bounds.west) / (bounds.east - bounds.west) - 0.5) * config.widthMm,
      ((north - mercatorY(lat)) / (north - south) - 0.5) * config.heightMm];
  };
  const clip: MultiPolygon = [[[[-config.widthMm / 2, -config.heightMm / 2], [config.widthMm / 2, -config.heightMm / 2], [config.widthMm / 2, config.heightMm / 2], [-config.widthMm / 2, config.heightMm / 2], [-config.widthMm / 2, -config.heightMm / 2]]]];
  const budget = createFeatureBudget();
  const result: WaterAreaV1[] = [];
  for (const collection of collections) for (const feature of collection.features) {
    signal?.throwIfAborted();
    if (!intersects(bounds, feature.bbox)) continue;
    if (!["Polygon", "MultiPolygon"].includes(feature.geometry.type)) throw new Error("Invalid shoreline geometry.");
    const parts = (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates) as Pair[][][];
    const projected = parts.map((rings) => rings.map((ring) => ring.map(project)));
    projected.forEach((rings) => budget(rings.map((ring) => ring.map(([x, y]) => ({ x, y }))), true));
    projected.forEach((rings, i) => {
      if (area(polygonClipping.intersection([rings], clip)) < config.minimumFeatureMm ** 2) return;
      // Keep real shores beyond the crop; clipping a polygon here would invent
      // a scored shoreline along the crop edge. The geometry stage clips output.
      result.push({ id: `survey-${feature.properties.sourceId}-${feature.properties.surveyId}-${i}`, kind: "lake",
        name: feature.properties.name, outlineSource: "provider", outlineSourceId: feature.properties.sourceId, surveyId: feature.properties.surveyId,
        polygon: polygon(rings), clipped: feature.bbox[0] <= bounds.west || feature.bbox[1] <= bounds.south || feature.bbox[2] >= bounds.east || feature.bbox[3] >= bounds.north });
    });
  }
  return result;
}

/** Prefer provider shores, but retain a complete lake over a partial survey mask.
 * Lower-priority copies of the same waterbody are suppressed, not cut into
 * strips that would create artificial shorelines and duplicate modeled basins.
 */
export function resolveLakeOutlines(providers: WaterAreaV1[], hydro: WaterAreaV1[], inland: Polygon2D[]): WaterAreaV1[] {
  let resolved = providers.length ? [...providers] : [...hydro];
  for (const lake of providers.length ? hydro : []) {
    const shape = input(lake.polygon), size = area(shape);
    const matches = resolved.filter((p) => {
      const other = input(p.polygon);
      return area(polygonClipping.intersection(shape, other)) > Math.min(size, area(other)) * 0.5;
    });
    if (!matches.length) { resolved.push(lake); continue; }
    const intersections = matches.map((p) => polygonClipping.intersection(shape, input(p.polygon)));
    const covered = area(polygonClipping.union(intersections[0]!, ...intersections.slice(1)));
    if (covered < size * 0.8) {
      resolved = resolved.filter((p) => !matches.includes(p));
      resolved.push(lake);
    } else {
      // Whole-lake estimates must not be assigned to individual survey basins.
      if (matches.length === 1 && covered >= area(input(matches[0]!.polygon)) * 0.8) resolved = resolved.map((p) => p === matches[0] ? {
        ...lake, ...p, hylakId: lake.hylakId, surfaceElevationM: lake.surfaceElevationM,
      } : p);
    }
  }
  inland.forEach((p, i) => {
    // polygon-clipping can fail on near-degenerate map water (a sliver shared
    // by two rivers, say). One such polygon is skipped rather than costing the
    // whole map its water: it is map-only water, which carves nothing anyway.
    try {
    const candidate = input(p), size = area(candidate);
    if (!(size > 0)) return;
    const matches = resolved.filter((lake) => {
      const other = input(lake.polygon);
      return area(polygonClipping.intersection(candidate, other)) > Math.min(size, area(other)) * 0.5;
    });
    if (matches.length) {
      // A provider depth-area mask may cover only one bay of the OSM lake.
      // Keep the complete shore and let the raster mask limit surveyed depths.
      if (matches.every((lake) => lake.outlineSource === "provider")) {
        const overlaps = matches.map((lake) => polygonClipping.intersection(candidate, input(lake.polygon)));
        if (area(polygonClipping.union(overlaps[0]!, ...overlaps.slice(1))) < size * 0.8) {
          resolved = resolved.filter((lake) => !matches.includes(lake));
        } else return;
      } else return;
    }
    resolved.push({ id: `osm-lake-${i}`, kind: "lake", polygon: p, outlineSource: "osm" });
    } catch (error) {
      console.warn("TopoStack: a map water outline could not be compared with the lake data and was left out.", error);
    }
  });
  return resolved;
}
