import { describe, expect, it, vi } from "vitest";
import type { GeoBounds, WaterAreaV1 } from "@topostack/core";
import { lakesNear, lakeWindow, wholeLake } from "$lib/domain/lake-lookup";

const square = (cx: number, cy: number, half: number) => ({
  outer: [{ x: cx - half, y: cy - half }, { x: cx + half, y: cy - half }, { x: cx + half, y: cy + half }, { x: cx - half, y: cy + half }],
  holes: [],
});

/** The map's own water, which these tests mostly leave out. */
const noMapWater = async () => [];

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
    const { lakes: found } = await lakesNear(place, undefined, load, noMapWater);
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
    expect((await lakesNear(place, undefined, load, noMapWater)).lakes.map((item) => item.id)).toEqual(["keeper"]);
  });

  it("names lakes known only from a survey instead of silently leaving them out", async () => {
    const load = vi.fn(async () => [
      lake("survey-mn-1", { hylakId: undefined, name: "Leech (Main Basin)", polygon: square(0, 0, 40) }),
      lake("survey-mn-2", { hylakId: undefined, name: undefined }),
      lake("osm-pond", { hylakId: undefined, name: "Pond" }),
    ]);
    expect(await lakesNear(place, undefined, load, noMapWater)).toEqual({ lakes: [], ponds: [], surveyed: ["Leech (Main Basin)"] });
  });

  it("lists lakes that only the map draws, which a chart finds by outline", async () => {
    const load = vi.fn(async () => [lake("hydro", { hylakId: 7, polygon: square(-40, 0, 10) })]);
    // Map water that matches no dataset lake becomes a lake of its own; water
    // over a dataset lake is that lake, not a second one.
    const river = { outer: [{ x: -30, y: 50 }, { x: 30, y: 50 }, { x: 30, y: 51 }, { x: -30, y: 51 }], holes: [] };
    const cutOff = square(95, 0, 10);
    // A river is long and thin, and water the window cuts off is not a whole lake: neither is offered.
    const mapWater = vi.fn(async () => [square(20, 0, 3), square(-40, 0, 10), river, cutOff]);
    const { lakes, ponds } = await lakesNear(place, undefined, load, mapWater);
    expect(lakes.map((item) => [item.name, item.hylakId])).toEqual([["hydro", 7]]);
    expect(ponds.map((item) => [item.name, item.hylakId])).toEqual([["Lake from the map", undefined]]);
    // Without the map's water the datasets still answer.
    expect((await lakesNear(place, undefined, load, async () => { throw new Error("offline"); })).lakes).toHaveLength(1);
  });

  it("lists a lake in parts once, by its largest part, and says when the window cut it off", async () => {
    const load = vi.fn(async () => [
      lake("lake-5-0", { hylakId: 5, name: undefined, polygon: square(-30, 0, 8) }),
      lake("lake-5-1", { hylakId: 5, name: "Two Arms", polygon: square(30, 0, 20), clipped: true }),
    ]);
    const { lakes } = await lakesNear(place, undefined, load, noMapWater);
    expect(lakes).toHaveLength(1);
    expect(lakes[0]).toMatchObject({ id: "lake-5-1", name: "Two Arms", hylakId: 5, clipped: true });
  });

  it("searches a window around the place, not the whole world", async () => {
    const load = vi.fn(async (bounds: GeoBounds) => { void bounds; return []; });
    await lakesNear(place, undefined, load, noMapWater);
    const bounds = load.mock.calls[0]![0];
    expect(bounds.south).toBeLessThan(place.lat);
    expect(bounds.north).toBeGreaterThan(place.lat);
    expect(bounds.north - bounds.south).toBeLessThan(1);
  });
});

describe("wholeLake", () => {
  const cut = { id: "lake-5-0", name: "Long Lake", hylakId: 5, outline: [[-80, 45], [-79.9, 45], [-79.9, 45.1], [-80, 45.1]] as [number, number][], footprint: 0.01, spanKm: [7.9, 11] as [number, number], distanceKm: 3, clipped: true };

  it("leaves a lake the search showed whole as it is", async () => {
    const load = vi.fn();
    const whole = { ...cut, clipped: false };
    expect(await wholeLake(whole, undefined, load, noMapWater)).toBe(whole);
    expect(load).not.toHaveBeenCalled();
  });

  it("loads a cut-off lake again over a wider window until all of it is in", async () => {
    const load = vi.fn(async (bounds: GeoBounds) => {
      const wide = bounds.east - bounds.west > 0.3;
      return [lake("lake-5-0", { hylakId: 5, name: undefined, polygon: square(0, 0, 60), clipped: !wide })];
    });
    const whole = await wholeLake(cut, undefined, load, noMapWater);
    expect(whole.clipped).toBe(false);
    expect(whole.name, "the name the maker picked is kept").toBe("Long Lake");
    expect(load.mock.calls.length).toBeGreaterThanOrEqual(1);
    const first = load.mock.calls[0]![0];
    expect(first.west).toBeLessThan(-80);
    expect(first.north).toBeGreaterThan(45.1);
  });

  it("loads a pond from the map again close up, for a shore worth snapping onto", async () => {
    const pond = { ...cut, id: "osm-lake-3", hylakId: undefined, clipped: false, outline: [[-80, 45], [-79.996, 45], [-79.996, 45.003], [-80, 45.003]] as [number, number][] };
    const water = vi.fn(async (bounds: GeoBounds) => {
      // The pond, drawn in detail, centred in whatever window is asked for.
      void bounds;
      return [{ outer: Array.from({ length: 40 }, (_, index) => ({ x: 30 * Math.cos((index / 40) * 2 * Math.PI), y: 30 * Math.sin((index / 40) * 2 * Math.PI) })), holes: [] }];
    });
    const detailed = await wholeLake(pond, undefined, vi.fn(async () => []), water);
    expect(detailed.outline.length).toBe(40);
    expect(detailed.name).toBe("Long Lake");
    const [bounds, zoom] = water.mock.calls[0]! as unknown as [GeoBounds, number];
    expect(bounds.east - bounds.west).toBeLessThan(0.02);
    expect(zoom).toBeGreaterThan(11);
  });

  it("refuses a lake still cut off at the widest window it will load", async () => {
    const load = vi.fn(async () => [lake("lake-5-0", { hylakId: 5, polygon: square(0, 0, 60), clipped: true })]);
    await expect(wholeLake(cut, undefined, load, noMapWater)).rejects.toThrow(/too large/);
  });
});
