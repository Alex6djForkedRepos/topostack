import { mercatorWorldY } from "../primitives/geometry2d.js";
import type { ElevationGrid, GeoBounds, MarkingFeature, ProjectConfigV1 } from "../types.js";


/** A readable, area-sensitive graticule interval chosen from 1/2/5 degree steps. */
export function coordinateGridInterval(bounds: GeoBounds): number {
  const target = Math.max(bounds.east - bounds.west, bounds.north - bounds.south) / 8;
  if (!(target > 0) || !Number.isFinite(target)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  for (const multiplier of [1, 2, 5, 10]) {
    const candidate = magnitude * multiplier;
    if (candidate >= target - 1e-12) return candidate;
  }
  return magnitude * 10;
}

function coordinateGridValues(minimum: number, maximum: number, interval: number): number[] {
  const epsilon = interval * 1e-7;
  const values: number[] = [];
  for (let value = Math.ceil((minimum + epsilon) / interval) * interval; value < maximum - epsilon && values.length < 1000; value += interval) {
    values.push(Math.abs(value) < epsilon ? 0 : Number(value.toFixed(10)));
  }
  return values;
}

export function coordinateGridMarkings(config: ProjectConfigV1, bounds: GeoBounds, grid: ElevationGrid): MarkingFeature[] {
  const interval = coordinateGridInterval(bounds);
  const longitudeSamples = Math.max(2, Math.min(256, grid.height));
  const latitudeSamples = Math.max(2, Math.min(256, grid.width));
  const northY = mercatorWorldY(bounds.north);
  const southY = mercatorWorldY(bounds.south);
  const markings: MarkingFeature[] = [];
  coordinateGridValues(bounds.west, bounds.east, interval).forEach((longitude) => {
    const x = ((longitude - bounds.west) / (bounds.east - bounds.west) - 0.5) * config.widthMm;
    markings.push({
      id: `coordinate-longitude-${Math.round(longitude * 1e7)}`,
      kind: "grid",
      operation: "engrave",
      points: Array.from({ length: longitudeSamples }, (_, index) => ({ x, y: (index / (longitudeSamples - 1) - 0.5) * config.heightMm })),
    });
  });
  coordinateGridValues(bounds.south, bounds.north, interval).forEach((latitude) => {
    const y = ((mercatorWorldY(latitude) - northY) / (southY - northY) - 0.5) * config.heightMm;
    markings.push({
      id: `coordinate-latitude-${Math.round(latitude * 1e7)}`,
      kind: "grid",
      operation: "engrave",
      points: Array.from({ length: latitudeSamples }, (_, index) => ({ x: (index / (latitudeSamples - 1) - 0.5) * config.widthMm, y })),
    });
  });
  return markings;
}
