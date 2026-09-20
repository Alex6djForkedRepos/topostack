/** Web Mercator's latitude limit, shared by every coordinate the generator accepts. */
export const MAX_LATITUDE = 85.0511;
export const MAX_LONGITUDE = 180;

/** True for a finite latitude/longitude pair inside the supported map area. */
export function isSupportedCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Math.abs(lat) <= MAX_LATITUDE && Number.isFinite(lon) && Math.abs(lon) <= MAX_LONGITUDE;
}

export const clampLatitude = (lat: number): number => Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat));
export const clampLongitude = (lon: number): number => Math.max(-MAX_LONGITUDE, Math.min(MAX_LONGITUDE, lon));
