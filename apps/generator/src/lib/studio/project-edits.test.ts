import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, MAX_CUSTOM_DATA_POINTS, MAX_CUSTOM_LINE_POINTS, MAX_MAP_MARKERS, NORTH_ARROW_MAX_SIZE_MM, NORTH_ARROW_MIN_SIZE_MM, type CustomLineFeatureV1, type ProjectConfigV1 } from "@topostack/core";
import { addCustomLine, addCustomLinePoint, addMarker, addMarkerAt, appendCustomData, canAddCustomLine, customDataCapacity, northArrowMaximumMm, removeCustomLine, removeCustomLinePoint, removeMarker, updateCustomLine, updateCustomLinePoint, updateMarker } from "$lib/studio/project-edits";

const line = (id: string, count = 2): CustomLineFeatureV1 => ({ id, kind: "trail", points: Array.from({ length: count }, (_, index) => ({ lat: 40, lon: -105 + index * 0.01 })) });
const withData = (patch: Partial<ProjectConfigV1>): ProjectConfigV1 => ({ ...DEFAULT_PROJECT, ...patch });

describe("north arrow size limit", () => {
  it("scales with the shorter side within the absolute bounds", () => {
    expect(northArrowMaximumMm(100, 60)).toBeCloseTo(27);
    expect(northArrowMaximumMm(10, 10)).toBe(NORTH_ARROW_MIN_SIZE_MM);
    expect(northArrowMaximumMm(2000, 2000)).toBe(NORTH_ARROW_MAX_SIZE_MM);
  });
});

describe("marker edits", () => {
  it("adds a pin at the map center until the marker limit", () => {
    expect(addMarker(DEFAULT_PROJECT, "m1")?.markers).toEqual([{ id: "m1", lat: DEFAULT_PROJECT.location.lat, lon: DEFAULT_PROJECT.location.lon, symbol: "pin", sizeMm: 8 }]);
    const full = withData({ markers: Array.from({ length: MAX_MAP_MARKERS }, (_, index) => ({ id: `m${index}`, lat: 0, lon: 0, symbol: "pin" as const })) });
    expect(addMarker(full, "extra")).toBeUndefined();
  });

  it("resizes only the chosen marker and rejects invalid sizes", () => {
    const project = withData({ markers: [{ id: "a", lat: 1, lon: 2, symbol: "pin" }, { id: "b", lat: 3, lon: 4, symbol: "star", sizeMm: 20 }] });
    expect(updateMarker(project, "a", { sizeMm: 12.5 })?.markers).toEqual([{ ...project.markers[0], sizeMm: 12.5 }, project.markers[1]]);
    for (const sizeMm of [0, -1, 201, NaN, Infinity]) expect(updateMarker(project, "a", { sizeMm })).toBeUndefined();
  });

  it("updates only valid coordinates and removes by id", () => {
    const project = withData({ markers: [{ id: "a", lat: 1, lon: 2, symbol: "pin" }, { id: "b", lat: 3, lon: 4, symbol: "star" }] });
    expect(updateMarker(project, "a", { lat: 45, symbol: "cross" })?.markers[0]).toEqual({ id: "a", lat: 45, lon: 2, symbol: "cross" });
    expect(updateMarker(project, "a", { lat: 86 })).toBeUndefined();
    expect(updateMarker(project, "a", { lon: Number.NaN })).toBeUndefined();
    expect(updateMarker(project, "missing", { lat: 1 })).toBeUndefined();
    expect(removeMarker(project, "a").markers.map((marker) => marker.id)).toEqual(["b"]);
  });
});

describe("custom line edits", () => {
  it("adds a two-point trail that stays inside the antimeridian", () => {
    const edge = withData({ location: { ...DEFAULT_PROJECT.location, lon: 180 } });
    const added = addCustomLine(edge, "l1")!.customLines[0]!;
    expect(added.kind).toBe("trail");
    expect(added.points.map((point) => point.lon)).toEqual([180, 179.998]);
  });

  it("respects the total point budget", () => {
    // One point short of the total budget, with l0 and l5 far below the per-line limit.
    const counts = [1000, MAX_CUSTOM_LINE_POINTS, MAX_CUSTOM_LINE_POINTS, MAX_CUSTOM_LINE_POINTS, MAX_CUSTOM_LINE_POINTS, MAX_CUSTOM_DATA_POINTS - 1000 - 4 * MAX_CUSTOM_LINE_POINTS - 1];
    const lines = counts.map((count, index) => line(`l${index}`, count));
    const nearlyFull = withData({ customLines: lines });
    expect(canAddCustomLine(nearlyFull)).toBe(false);
    expect(addCustomLine(nearlyFull, "extra")).toBeUndefined();
    expect(addCustomLinePoint(nearlyFull, "l0")).toBeDefined();
    expect(addCustomLinePoint(nearlyFull, "l1")).toBeUndefined();
    expect(addCustomLinePoint(withData(addCustomLinePoint(nearlyFull, "l0")!), "l0")).toBeUndefined();
  });

  it("edits, duplicates, and removes points while keeping at least two", () => {
    const project = withData({ customLines: [line("a", 3), line("b")] });
    expect(updateCustomLine(project, "b", { kind: "boundary" }).customLines[1]?.kind).toBe("boundary");
    expect(updateCustomLinePoint(project, "a", 1, { lat: 41 })?.customLines[0]?.points[1]).toEqual({ lat: 41, lon: -104.99 });
    expect(updateCustomLinePoint(project, "a", 1, { lon: 181 })).toBeUndefined();
    expect(updateCustomLinePoint(project, "a", 9, { lat: 1 })).toBeUndefined();
    expect(addCustomLinePoint(project, "a")?.customLines[0]?.points.at(-1)).toEqual(project.customLines[0]?.points.at(-1));
    expect(removeCustomLinePoint(project, "a", 0)?.customLines[0]?.points).toHaveLength(2);
    expect(removeCustomLinePoint(project, "b", 0)).toBeUndefined();
    expect(removeCustomLine(project, "a").customLines.map((item) => item.id)).toEqual(["b"]);
  });
});

describe("imported custom data", () => {
  it("reports the remaining allowance and appends pins and paths with fresh ids", () => {
    const project: ProjectConfigV1 = { ...DEFAULT_PROJECT, markers: [{ id: "m", lat: 1, lon: 1, symbol: "star", sizeMm: 5 }], customLines: [{ id: "l", kind: "boundary", points: [{ lat: 1, lon: 1 }, { lat: 2, lon: 2 }, { lat: 3, lon: 3 }] }] };
    expect(customDataCapacity(project)).toEqual({ markers: MAX_MAP_MARKERS - 1, lines: 249, points: MAX_CUSTOM_DATA_POINTS - 3 });
    let id = 0;
    const patch = appendCustomData(project, { markers: [{ lat: 4, lon: 5 }], lines: [{ kind: "trail", points: [{ lat: 4, lon: 5 }, { lat: 6, lon: 7 }] }] }, () => `new-${id += 1}`);
    expect(patch.markers).toEqual([project.markers[0], { id: "new-1", lat: 4, lon: 5, symbol: "pin", sizeMm: 8 }]);
    expect(patch.customLines).toEqual([project.customLines[0], { id: "new-2", kind: "trail", points: [{ lat: 4, lon: 5 }, { lat: 6, lon: 7 }] }]);
  });
});

describe("placing markers on the map", () => {
  it("adds a pin at the clicked point unless it is unsupported or the list is full", () => {
    const patch = addMarkerAt(DEFAULT_PROJECT, "placed", { lat: 42.95, lon: -122.1 });
    expect(patch?.markers).toEqual([{ id: "placed", lat: 42.95, lon: -122.1, symbol: "pin", sizeMm: 8 }]);
    expect(addMarkerAt(DEFAULT_PROJECT, "polar", { lat: 89, lon: 0 })).toBeUndefined();
    const full = { ...DEFAULT_PROJECT, markers: Array.from({ length: MAX_MAP_MARKERS }, (_, index) => ({ id: String(index), lat: 1, lon: 1, symbol: "pin" as const, sizeMm: 8 })) };
    expect(addMarkerAt(full, "extra", { lat: 1, lon: 1 })).toBeUndefined();
  });
});
