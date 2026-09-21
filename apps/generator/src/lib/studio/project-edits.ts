import { MAP_MARKER_SIZE_MM, MAP_MARKER_MIN_SIZE_MM, MAP_MARKER_MAX_SIZE_MM, MAX_CUSTOM_DATA_POINTS, MAX_CUSTOM_LINE_POINTS, MAX_CUSTOM_LINES, MAX_MAP_MARKERS, NORTH_ARROW_MAX_MAP_FRACTION, NORTH_ARROW_MAX_SIZE_MM, NORTH_ARROW_MIN_SIZE_MM, type CustomLineFeatureV1, type GeoPoint, type MapMarkerV1, type ProjectConfigV1 } from "@topostack/core";
import { clampLongitude, isSupportedCoordinate } from "$lib/domain/coordinates";

/**
 * Pure edits for user-authored markers and paths. Each returns the project
 * patch to apply, or `undefined` when the edit is not allowed.
 */
type Project = Pick<ProjectConfigV1, "location" | "markers" | "customLines">;
type MarkersPatch = Pick<ProjectConfigV1, "markers">;
type CustomLinesPatch = Pick<ProjectConfigV1, "customLines">;

/** The largest north arrow that fits a map of this size. */
export function northArrowMaximumMm(widthMm: number, heightMm: number): number {
  return Math.min(NORTH_ARROW_MAX_SIZE_MM, Math.max(NORTH_ARROW_MIN_SIZE_MM, Math.min(widthMm, heightMm) * NORTH_ARROW_MAX_MAP_FRACTION));
}

export function customDataPointCount(project: Pick<ProjectConfigV1, "customLines">): number {
  return project.customLines.reduce((total, line) => total + line.points.length, 0);
}

export const canAddMarker = (project: Pick<ProjectConfigV1, "markers">): boolean => project.markers.length < MAX_MAP_MARKERS;
export const canAddCustomLine = (project: Pick<ProjectConfigV1, "customLines">): boolean =>
  project.customLines.length < MAX_CUSTOM_LINES && customDataPointCount(project) + 2 <= MAX_CUSTOM_DATA_POINTS;
export const canAddCustomLinePoint = (project: Pick<ProjectConfigV1, "customLines">, line: CustomLineFeatureV1): boolean =>
  line.points.length < MAX_CUSTOM_LINE_POINTS && customDataPointCount(project) < MAX_CUSTOM_DATA_POINTS;

export function addMarker(project: Project, id: string): MarkersPatch | undefined {
  if (!canAddMarker(project)) return undefined;
  const marker: MapMarkerV1 = { id, lat: project.location.lat, lon: project.location.lon, symbol: "pin", sizeMm: MAP_MARKER_SIZE_MM };
  return { markers: [...project.markers, marker] };
}

/** A pin at a chosen point, as placed by clicking the map. */
export function addMarkerAt(project: Project, id: string, point: GeoPoint): MarkersPatch | undefined {
  if (!canAddMarker(project) || !isSupportedCoordinate(point.lat, point.lon)) return undefined;
  return { markers: [...project.markers, { id, lat: point.lat, lon: point.lon, symbol: "pin", sizeMm: MAP_MARKER_SIZE_MM }] };
}

export function updateMarker(project: Project, id: string, patch: Partial<MapMarkerV1>): MarkersPatch | undefined {
  const current = project.markers.find((marker) => marker.id === id);
  if (!current) return undefined;
  const next = { ...current, ...patch };
  if (!isSupportedCoordinate(next.lat, next.lon)) return undefined;
  const size = next.sizeMm === undefined ? MAP_MARKER_SIZE_MM : next.sizeMm;
  if (!Number.isFinite(size) || size < MAP_MARKER_MIN_SIZE_MM || size > MAP_MARKER_MAX_SIZE_MM) return undefined;
  return { markers: project.markers.map((marker) => marker.id === id ? next : marker) };
}

export function removeMarker(project: Project, id: string): MarkersPatch {
  return { markers: project.markers.filter((marker) => marker.id !== id) };
}

export function addCustomLine(project: Project, id: string): CustomLinesPatch | undefined {
  if (!canAddCustomLine(project)) return undefined;
  const longitudeDelta = project.location.lon > 179.998 ? -0.002 : 0.002;
  const line: CustomLineFeatureV1 = {
    id,
    kind: "trail",
    points: [
      { lat: project.location.lat, lon: project.location.lon },
      { lat: project.location.lat, lon: clampLongitude(project.location.lon + longitudeDelta) },
    ],
  };
  return { customLines: [...project.customLines, line] };
}

export function updateCustomLine(project: Project, id: string, patch: Partial<CustomLineFeatureV1>): CustomLinesPatch {
  return { customLines: project.customLines.map((line) => line.id === id ? { ...line, ...patch } : line) };
}

export function updateCustomLinePoint(project: Project, id: string, pointIndex: number, patch: Partial<GeoPoint>): CustomLinesPatch | undefined {
  const line = project.customLines.find((item) => item.id === id);
  const current = line?.points[pointIndex];
  if (!line || !current) return undefined;
  const next = { ...current, ...patch };
  if (!isSupportedCoordinate(next.lat, next.lon)) return undefined;
  return updateCustomLine(project, id, { points: line.points.map((point, index) => index === pointIndex ? next : point) });
}

export function addCustomLinePoint(project: Project, id: string): CustomLinesPatch | undefined {
  const line = project.customLines.find((item) => item.id === id);
  const last = line?.points.at(-1);
  if (!line || !last || !canAddCustomLinePoint(project, line)) return undefined;
  return updateCustomLine(project, id, { points: [...line.points, { ...last }] });
}

export function removeCustomLinePoint(project: Project, id: string, pointIndex: number): CustomLinesPatch | undefined {
  const line = project.customLines.find((item) => item.id === id);
  if (!line || line.points.length <= 2) return undefined;
  return updateCustomLine(project, id, { points: line.points.filter((_, index) => index !== pointIndex) });
}

export function removeCustomLine(project: Project, id: string): CustomLinesPatch {
  return { customLines: project.customLines.filter((line) => line.id !== id) };
}
