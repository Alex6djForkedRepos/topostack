import { cellsTouchGridEdge } from "./grid.js";
import type { ElevationGrid } from "./types.js";

const NEIGHBORS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/**
 * A terrain-informed shape prior, not a bathymetric measurement. Sample dry
 * terrain outward from the shore, carry its slope into the basin, then solve
 * |gradient(depth)| = slopeFactor. Shallow banks extend farther underwater;
 * steep banks drop faster and can move the deepest point away from the center.
 * The caller still supplies the lake's maximum and mean depth constraints.
 *
 * Uses only the original DEM and the union of all water masks, so other lakes
 * (including ones already carved) cannot be mistaken for surrounding land.
 */
export function terrainBasinDistance(
  grid: ElevationGrid,
  mask: Uint8Array,
  allWater: Uint8Array,
  cells: readonly number[],
  distance: Float64Array,
  spacingX: number,
  spacingY: number,
  surfaceM: number,
  referenceSlope: number,
  clipped: boolean,
  /**
   * Full-grid scratch arrays reused across lakes. Only the lake's cells and a
   * one-cell margin are reset, and the returned array may be `buffers.result`.
   */
  buffers?: { factors: Float64Array; result: Float64Array },
  /** Distances reach the vector shore between samples, rather than dry cell centers. */
  vectorShore = false,
  /** The caller's own edge scan, which the shore measurement already needed. */
  touchesGridEdge?: boolean,
): Float64Array {
  const { width, height, values } = grid;
  // A partial shoreline cannot constrain the whole basin. Never normalize a
  // terrain prediction against just the portion visible in the crop.
  if (clipped || (touchesGridEdge ?? cellsTouchGridEdge(cells, width, height))) return distance;

  // Factors are only ever read at lake cells: every neighbour lookup checks the mask first.
  const factors = buffers?.factors ?? new Float64Array(values.length);
  for (const cell of cells) factors[cell] = Number.NaN;
  const spacing = Math.max(spacingX, spacingY);
  const sampleRadius = Math.max(4 * spacing, Math.min(250, 12 * spacing));
  const baseline = Math.max(0.01, referenceSlope);
  let measured = 0, smallest = Infinity, largest = -Infinity;
  for (const cell of cells) {
    const x = cell % width, y = Math.floor(cell / width);
    let nx = 0, ny = 0, shore = false;
    for (const [dx, dy] of NEIGHBORS) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height || mask[yy * width + xx]) continue;
      shore = true;
      const length = Math.hypot(dx * spacingX, dy * spacingY);
      nx += dx * spacingX / length;
      ny += dy * spacingY / length;
    }
    if (!shore) continue;
    factors[cell] = 1;
    const length = Math.hypot(nx, ny);
    if (length < 1e-6) continue;
    nx /= length; ny /= length;
    const slopes: number[] = [];
    // A small fan reduces sensitivity to raster stair steps and isolated DEM
    // spikes. Each ray must have several distinct, contiguous dry samples.
    for (const angle of [-Math.PI / 6, 0, Math.PI / 6]) {
      const ux = nx * Math.cos(angle) - ny * Math.sin(angle);
      const uy = nx * Math.sin(angle) + ny * Math.cos(angle);
      const rises: number[] = [];
      let previous = -1;
      for (let step = 1; step <= 6; step += 1) {
        const run = sampleRadius * step / 6;
        const xx = Math.round(x + ux * run / spacingX), yy = Math.round(y + uy * run / spacingY);
        if (xx < 0 || xx >= width || yy < 0 || yy >= height) break;
        const sample = yy * width + xx;
        if (sample === cell || sample === previous) continue;
        previous = sample;
        if (allWater[sample] || !Number.isFinite(values[sample])) break;
        const horizontal = Math.hypot((xx - x) * spacingX, (yy - y) * spacingY);
        rises.push(Math.max(0, values[sample]! - surfaceM) / horizontal);
      }
      if (rises.length >= 3) slopes.push(median(rises));
    }
    if (!slopes.length) continue;
    const slope = median(slopes);
    // Regularize toward the existing basin gradient. Terrain is evidence for
    // relative shape, not permission for cliffs or flat DEMs to dictate depth.
    const factor = Math.max(0.5, Math.min(2, Math.sqrt((slope + baseline) / (2 * baseline))));
    factors[cell] = factor;
    measured += 1;
    smallest = Math.min(smallest, factor);
    largest = Math.max(largest, factor);
  }
  // Uniform/flat terrain adds no directional information; preserve the exact
  // Euclidean fallback, including its behavior at coarse resolutions.
  if (measured < 4 || largest - smallest < 0.05) return distance;

  // Carry bank influence inward along the distance gradient. Averaging every
  // nearer neighbor avoids assigning a hard nearest-shore/Voronoi seam.
  const ordered = [...cells].sort((a, b) => distance[a]! - distance[b]!);
  for (const cell of ordered) {
    if (Number.isFinite(factors[cell])) continue;
    const x = cell % width, y = Math.floor(cell / width);
    let sum = 0, weight = 0;
    for (const [dx, dy] of NEIGHBORS) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || xx >= width || yy < 0 || yy >= height) continue;
      const neighbor = yy * width + xx;
      if (!mask[neighbor] || !Number.isFinite(factors[neighbor]) || distance[neighbor]! >= distance[cell]!) continue;
      const w = (distance[cell]! - distance[neighbor]!) / ((dx * spacingX) ** 2 + (dy * spacingY) ** 2);
      sum += factors[neighbor]! * w;
      weight += w;
    }
    factors[cell] = weight ? sum / weight : 1;
  }

  // Fast sweeping solves the Eikonal equation in physical meters. The raster
  // fallback fixes dry cells at zero; vector shores seed boundary water cells.
  // Unlike multiplying distance by a bank factor, this
  // forms a continuous floor where opposing slopes meet without depth jumps.
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (const cell of cells) {
    minX = Math.min(minX, cell % width); maxX = Math.max(maxX, cell % width);
    minY = Math.min(minY, Math.floor(cell / width)); maxY = Math.max(maxY, Math.floor(cell / width));
  }
  // The sweep reads lake cells and their direct neighbours, which lie inside the
  // grid because edge-touching lakes returned above. Vector mode excludes dry
  // neighbours from the solve after seeding the real shoreline distances.
  const result = buffers?.result ?? new Float64Array(values.length);
  for (let y = minY - 1; y <= maxY + 1; y += 1) result.fill(vectorShore ? Infinity : 0, y * width + minX - 1, y * width + maxX + 2);
  for (const cell of cells) {
    // Seed at the actual shore distance. Seeding dry cells at zero instead
    // turns the shallow basin into terraces aligned with raster rows/columns.
    const shore = vectorShore && NEIGHBORS.some(([dx, dy]) => !mask[cell + dy * width + dx]);
    result[cell] = shore ? distance[cell]! * factors[cell]! : Infinity;
  }
  const wx = 1 / spacingX ** 2, wy = 1 / spacingY ** 2;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    let change = 0;
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      for (let y = sy === 1 ? minY : maxY; y >= minY && y <= maxY; y += sy!) {
        for (let x = sx === 1 ? minX : maxX; x >= minX && x <= maxX; x += sx!) {
          const cell = y * width + x;
          if (!mask[cell]) continue;
          const a = Math.min(result[cell - 1]!, result[cell + 1]!);
          const b = Math.min(result[cell - width]!, result[cell + width]!);
          const f = factors[cell]!;
          let next = Math.min(a + spacingX * f, b + spacingY * f);
          if (Number.isFinite(a) && Number.isFinite(b)) {
            // Solve relative to a to avoid cancellation on large lake grids.
            const delta = b - a;
            const discriminant = (wx + wy) * f * f - wx * wy * delta * delta;
            if (discriminant >= 0) {
              const root = a + (wy * delta + Math.sqrt(discriminant)) / (wx + wy);
              if (root >= Math.max(a, b)) next = Math.min(next, root);
            }
          }
          if (next < result[cell]!) {
            change = Math.max(change, result[cell]! - next);
            result[cell] = next;
          }
        }
      }
    }
    if (change < spacing * 1e-5) return result;
  }
  // Pathological shapes must not turn a bounded preview calculation into an
  // unbounded solve, or expose a floor that has not converged.
  return distance;
}
