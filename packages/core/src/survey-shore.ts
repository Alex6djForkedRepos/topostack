/**
 * Fill a narrow uncovered survey rim from nearby measured depths, tapering to
 * the vector shoreline. This is an estimate only: survey samples are untouched
 * and the caller retains mixed provenance. Remote/interior gaps stay unknown.
 */
export function surveyShoreDepths(
  depths: Float32Array, mask: Uint8Array, cells: readonly number[], distance: Float64Array,
  width: number, height: number, spacingX: number, spacingY: number, nativeSpacingM?: number,
): Float64Array {
  const result = new Float64Array(depths.length).fill(Number.NaN);
  const nativeSpacing = Number.isFinite(nativeSpacingM) && nativeSpacingM! > 0 ? nativeSpacingM! : 0;
  const support = 3 * Math.max(spacingX, spacingY, nativeSpacing);
  // Bounded even for a provider much coarser than the terrain grid. This limits
  // interpolation work; insufficient nearby coverage keeps the existing fallback.
  const radiusX = Math.min(24, Math.ceil(support / spacingX));
  const radiusY = Math.min(24, Math.ceil(support / spacingY));
  for (const cell of cells) {
    if (Number.isFinite(depths[cell]) || !(distance[cell]! <= support)) continue;
    const x = cell % width, y = Math.floor(cell / width);
    let sum = 0, weight = 0;
    for (let dy = -radiusY; dy <= radiusY; dy += 1) for (let dx = -radiusX; dx <= radiusX; dx += 1) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
      const neighbor = yy * width + xx, depth = depths[neighbor]!;
      const squared = (dx * spacingX) ** 2 + (dy * spacingY) ** 2;
      if (!mask[neighbor] || !Number.isFinite(depth) || depth < 0 || squared === 0 || squared >= support ** 2) continue;
      // Do not carry observations through dry banks/islands into another bay.
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      let connected = true;
      for (let step = 1; step < steps; step += 1) {
        if (!mask[Math.round(y + dy * step / steps) * width + Math.round(x + dx * step / steps)]) { connected = false; break; }
      }
      if (!connected) continue;
      const taper = Math.min(1, distance[cell]! / Math.max(distance[neighbor]!, Math.min(spacingX, spacingY) * 0.25));
      const w = (1 - Math.sqrt(squared) / support) ** 2 / squared;
      sum += depth * taper * w;
      weight += w;
    }
    if (weight > 0) result[cell] = sum / weight;
  }
  return result;
}
