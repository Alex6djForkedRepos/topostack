import type { ProjectConfigV1, SourceBundleV1 } from "../types.js";


export function createSyntheticSource(config: ProjectConfigV1, size = 96): SourceBundleV1 {
  const values = new Float32Array(size * size);
  const seedX = Math.sin(config.location.lat * 0.13) * 0.8;
  const seedY = Math.cos(config.location.lon * 0.11) * 0.8;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x / (size - 1) - 0.5) * 2;
      const ny = (y / (size - 1) - 0.5) * 2;
      const peak = Math.exp(-((nx - seedX * 0.22) ** 2 * 2.6 + (ny - seedY * 0.22) ** 2 * 3.2));
      const ridge = Math.exp(-Math.abs(ny + Math.sin(nx * 4.2 + seedX) * 0.22) * 5.5) * 0.36;
      const detail = Math.sin(nx * 10 + seedY * 3) * Math.cos(ny * 8 - seedX * 4) * 0.055;
      // ~1.2 km of relief. The amplitude has to stay believable for the window
      // below, because layer count is derived from the two together.
      const elevation = 850 + (peak + ridge + detail) * 860;
      values[y * size + x] = elevation;
      min = Math.min(min, elevation);
      max = Math.max(max, elevation);
    }
  }
  return {
    schemaVersion: 1,
    elevation: { width: size, height: size, values, min, max },
    markings: [],
    vectorStatus: "available",
    lakeDataStatus: "available",
    datasetVersion: "synthetic-v1",
    sourceKind: "synthetic",
    // Roughly the ground window the app requests at its default zoom, so the
    // fallback's map scale — and the layer count derived from it — stay sane.
    bounds: config.location.bounds ?? { west: config.location.lon - 0.1445, south: config.location.lat - 0.101, east: config.location.lon + 0.1445, north: config.location.lat + 0.101 },
    imagerySources: [],
    attribution: [{ name: "TopoStack deterministic terrain preview", url: "https://github.com/", license: "Development fixture" }],
  };
}
