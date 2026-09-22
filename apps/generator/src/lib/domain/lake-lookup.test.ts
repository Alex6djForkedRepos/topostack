import { describe, expect, it, vi } from "vitest";
import type { GeoBounds, WaterAreaV1 } from "@topostack/core";
import { lakesNear, lakeWindow } from "$lib/domain/lake-lookup";

const square = (cx: number, cy: number, half: number) => ({
  outer: [{ x: cx - half, y: cy - half }, { x: cx + half, y: cy - half }, { x: cx + half, y: cy + half }, { x: cx - half, y: cy + half }],
  holes: [],
});

const lake = (id: string, overrides: Partial<WaterAreaV1> = {}): WaterAreaV1 => ({
  id, kind: "lake", name: id, hylakId: 42, polygon: square(0, 0, 20), ...overrides,
});

describe("lakeWindow", () => {
  it("frames a square of ground around a place", () => {
    const window = lakeWindow(45, -80, 0.1);
    expect(window.north - window.south).toBeCloseTo(0.1, 6);
    // Longitude degrees are shorter at 45 N, so the window is wider in degrees.
    expect(window.east - window.west).toBeGreaterThan(0.1);
    expect((window.east - window.west) * Math.cos((45 * Math.PI) / 180)).toBeCloseTo(0.1, 6);
    // Near the poles the widening is capped rather than running away.
    expect(lakeWindow(89, 0, 0.1).east).toBeLessThan(0.3);
  });
});

describe("lakesNear", () => {
  const place = { lat: 45, lon: -80 };

  it("returns lakes in ground coordinates, largest first", async () => {
    const load = vi.fn(async () => [
      lake("small", { hylakId: 7, polygon: square(0, 0, 10) }),
      lake("big", { hylakId: 9, polygon: square(0, 0, 40) }),
    ]);
    const found = await lakesNear(place, undefined, load);
    expect(found.map((item) => item.id)).toEqual(["big", "small"]);
    expect(found[0]!.hylakId).toBe(9);
    // The outline is lon/lat around the searched place, not artwork millimetres.
    for (const [lon, lat] of found[0]!.outline) {
      expect(Math.abs(lon - place.lon)).toBeLessThan(1);
      expect(Math.abs(lat - place.lat)).toBeLessThan(1);
    }
    expect(found[0]!.footprint).toBeGreaterThan(found[1]!.footprint);
  });

  it("offers only lakes a project could name", async () => {
    const load = vi.fn(async () => [
      lake("ocean", { kind: "ocean" }),
      lake("no-id", { hylakId: undefined }),
      lake("sliver", { polygon: { outer: [{ x: 0, y: 0 }, { x: 1, y: 1 }], holes: [] } }),
      lake("keeper", { hylakId: 11 }),
    ]);
    expect((await lakesNear(place, undefined, load)).map((item) => item.id)).toEqual(["keeper"]);
  });

  it("searches a window around the place, not the whole world", async () => {
    const load = vi.fn(async (bounds: GeoBounds) => { void bounds; return []; });
    await lakesNear(place, undefined, load);
    const bounds = load.mock.calls[0]![0];
    expect(bounds.south).toBeLessThan(place.lat);
    expect(bounds.north).toBeGreaterThan(place.lat);
    expect(bounds.north - bounds.south).toBeLessThan(1);
  });
});
