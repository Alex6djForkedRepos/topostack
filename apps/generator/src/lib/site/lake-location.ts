import { coverBounds, zoomForBounds, type ProjectConfigV1 } from "@topostack/core";

/** Directory links carry a place only; fabrication settings remain the user's choice. */
export function lakeLocationFromSearch(search: string, widthMm = 300, heightMm = 200): ProjectConfigV1["location"] | undefined {
  const params = new URLSearchParams(search);
  const label = params.get("lake")?.trim();
  const raw = params.get("bounds")?.split(",");
  if (!label || label.length > 180 || !raw || raw.length !== 4 || raw.some((value) => !value.trim())) return undefined;
  const [west, south, east, north] = raw.map(Number) as [number, number, number, number];
  if (![west, south, east, north].every(Number.isFinite) || west < -180 || east > 180 || south < -85 || north > 85 || west >= east || south >= north) return undefined;
  // Expand to the physical cut's aspect ratio so the studio's inscribed crop
  // keeps the entire selected survey area, including long, narrow lakes.
  const bounds = coverBounds({ west, south, east, north }, widthMm, heightMm);
  if (bounds.west < -180 || bounds.east > 180 || bounds.south < -85 || bounds.north > 85) return undefined;
  return { label, lat: (south + north) / 2, lon: (west + east) / 2, zoom: zoomForBounds(bounds), bounds };
}
