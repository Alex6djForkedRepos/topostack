import { decodeTerrainPng } from "@topostack/data-contracts/terrain-png";
import { TILE_SIZE, latToWorldY, lonToWorldX, type GeoBounds, type ReliefSample } from "@topostack/core/project";

/**
 * A coarse look at the ground inside a crop: at most four low-zoom Terrarium
 * tiles, so an agent can be told roughly how many sheets a design needs
 * without generating it. Sampling elevation is not contour generation; the
 * studio's count stays authoritative because coarse tiles smooth peaks.
 */
export const MAX_RELIEF_TILES = 4;
const MAX_RELIEF_ZOOM = 12;

export interface ReliefTile { z: number; x: number; y: number }

export interface ReliefEstimate extends ReliefSample {
  zoom: number;
  tiles: number;
  /** Samples at or below sea level were left out as open water. */
  coastal: boolean;
}

export class ReliefUnavailableError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = "ReliefUnavailableError"; }
}

interface Window { zoom: number; minX: number; maxX: number; minY: number; maxY: number }

/** The most detailed zoom at which the crop needs at most MAX_RELIEF_TILES tiles. */
export function reliefWindow(bounds: GeoBounds): Window {
  for (let zoom = MAX_RELIEF_ZOOM; zoom >= 0; zoom -= 1) {
    const minX = Math.floor(lonToWorldX(bounds.west, zoom) / TILE_SIZE);
    const maxX = Math.floor((lonToWorldX(bounds.east, zoom) - 1e-6) / TILE_SIZE);
    const minY = Math.floor(latToWorldY(bounds.north, zoom) / TILE_SIZE);
    const maxY = Math.floor((latToWorldY(bounds.south, zoom) - 1e-6) / TILE_SIZE);
    if ((maxX - minX + 1) * (maxY - minY + 1) <= MAX_RELIEF_TILES) return { zoom, minX, maxX, minY, maxY };
  }
  return { zoom: 0, minX: 0, maxX: 0, minY: 0, maxY: 0 };
}

export function reliefTiles(bounds: GeoBounds): ReliefTile[] {
  const window = reliefWindow(bounds);
  const tiles: ReliefTile[] = [];
  for (let y = window.minY; y <= window.maxY; y += 1) {
    for (let x = window.minX; x <= window.maxX; x += 1) tiles.push({ z: window.zoom, x, y });
  }
  return tiles;
}

/**
 * The land's lowest and highest samples inside the crop (inside the inscribed
 * ellipse for a circular model). As in generation, the stack is sized from
 * land alone: when the crop reaches the sea, samples at or below 0 m are left
 * out so the ocean floor does not inflate the relief.
 */
export function sampleRelief(bounds: GeoBounds, circle: boolean, tiles: ReadonlyArray<{ tile: ReliefTile; png: Uint8Array }>): ReliefEstimate {
  const zoom = tiles[0]?.tile.z ?? 0;
  const west = lonToWorldX(bounds.west, zoom);
  const east = lonToWorldX(bounds.east, zoom);
  const north = latToWorldY(bounds.north, zoom);
  const south = latToWorldY(bounds.south, zoom);
  const centerX = (west + east) / 2, centerY = (north + south) / 2;
  const radiusX = (east - west) / 2, radiusY = (south - north) / 2;
  let min = Infinity, max = -Infinity, landMax = -Infinity;
  let nearest = { distance: Infinity, value: 0 };
  for (const { tile, png } of tiles) {
    const values = decodeTerrainPng(png, true);
    for (let row = 0; row < TILE_SIZE; row += 1) {
      const worldY = tile.y * TILE_SIZE + row + 0.5;
      for (let column = 0; column < TILE_SIZE; column += 1) {
        const value = values[row * TILE_SIZE + column]!;
        if (!Number.isFinite(value)) continue;
        const worldX = tile.x * TILE_SIZE + column + 0.5;
        const dx = (worldX - centerX) / radiusX, dy = (worldY - centerY) / radiusY;
        const distance = dx * dx + dy * dy;
        if (distance < nearest.distance) nearest = { distance, value };
        const inside = circle ? distance <= 1 : Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
        if (!inside) continue;
        min = Math.min(min, value); max = Math.max(max, value);
        if (value > 0) landMax = Math.max(landMax, value);
      }
    }
  }
  // A crop narrower than one sample still has the ground under its center.
  if (!Number.isFinite(min)) min = max = nearest.value;
  const coastal = min <= 0 && Number.isFinite(landMax);
  return { minM: coastal ? 0 : min, maxM: coastal ? landMax : max, zoom, tiles: tiles.length, coastal };
}

/** Fetch the tiles through `loadTile` (the Worker's own cached terrain route) and sample them. */
export async function estimateRelief(bounds: GeoBounds, circle: boolean, loadTile: (tile: ReliefTile) => Promise<Uint8Array>): Promise<ReliefEstimate> {
  const tiles = reliefTiles(bounds);
  const loaded = await Promise.all(tiles.map(async (tile) => ({ tile, png: await loadTile(tile) })));
  return sampleRelief(bounds, circle, loaded);
}
