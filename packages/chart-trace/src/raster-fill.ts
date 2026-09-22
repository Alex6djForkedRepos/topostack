import type { Point2 } from "./local-frame.ts";

/** A grid whose row 0 is at the top (largest y), matching north-up rasters. */
export interface GridLayout {
  left: number;
  top: number;
  resolution: number;
  width: number;
  height: number;
}

/**
 * Marks cells whose centre falls inside the rings under the even-odd rule, so
 * holes are simply further rings. This is rasterio's default
 * (`all_touched=False`) centre test, done per row with scanlines so a long
 * shoreline costs rows x edges rather than cells x edges.
 */
export function fillRings(rings: readonly (readonly Point2[])[], layout: GridLayout): Uint8Array {
  const { left, top, resolution, width, height } = layout;
  const mask = new Uint8Array(width * height);
  const crossings: number[] = [];
  for (let row = 0; row < height; row += 1) {
    const y = top - (row + 0.5) * resolution;
    crossings.length = 0;
    for (const ring of rings) {
      for (let index = 0; index < ring.length; index += 1) {
        const [x1, y1] = ring[index]!;
        const [x2, y2] = ring[(index + 1) % ring.length]!;
        // Half-open so a vertex exactly on the scanline is counted once.
        if ((y1 <= y) === (y2 <= y)) continue;
        crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    crossings.sort((a, b) => a - b);
    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      // Cell centres at left + (column + 0.5) * resolution inside [start, end).
      const first = Math.max(0, Math.ceil((crossings[pair]! - left) / resolution - 0.5));
      const last = Math.min(width - 1, Math.ceil((crossings[pair + 1]! - left) / resolution - 0.5) - 1);
      mask.fill(1, row * width + first, row * width + last + 1);
    }
  }
  return mask;
}
