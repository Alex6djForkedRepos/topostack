import type { GeoBounds } from "@topostack/core";

/** Center the physical cut inside the selected area in the map's Mercator plane. */
export function fitCutBounds(bounds: GeoBounds, widthMm: number, heightMm: number): GeoBounds {
  const radians = Math.PI / 180;
  const north = Math.asinh(Math.tan(bounds.north * radians));
  const south = Math.asinh(Math.tan(bounds.south * radians));
  const width = (bounds.east - bounds.west) * radians;
  const height = north - south;
  const aspect = widthMm / heightMm;
  // Preserve already fitted bounds exactly across reloads and camera updates.
  if (Math.abs(width / height / aspect - 1) < 1e-7) return bounds;
  const fittedWidth = Math.min(width, height * aspect);
  const fittedHeight = fittedWidth / aspect;
  const centerLon = (bounds.west + bounds.east) / 2;
  const centerY = (north + south) / 2;
  return {
    west: centerLon - fittedWidth / radians / 2,
    east: centerLon + fittedWidth / radians / 2,
    north: Math.atan(Math.sinh(centerY + fittedHeight / 2)) / radians,
    south: Math.atan(Math.sinh(centerY - fittedHeight / 2)) / radians,
  };
}
