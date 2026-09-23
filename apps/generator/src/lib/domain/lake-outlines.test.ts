import release from "../../../../../scripts/data/lake-outlines-release.json";
import { afterEach, describe, expect, it, vi } from "vitest";
import polygonClipping from "polygon-clipping";
import { DEFAULT_PROJECT, type Polygon2D, type WaterAreaV1 } from "@topostack/core";
import { loadProviderOutlines, resolveLakeOutlines } from "$lib/domain/lake-outlines";

const box = (lo: number, hi: number): Polygon2D => ({ outer: [{ x: lo, y: lo }, { x: hi, y: lo }, { x: hi, y: hi }, { x: lo, y: hi }, { x: lo, y: lo }], holes: [] });
const lake = (id: string, polygon = box(-10, 10)): WaterAreaV1 => ({ id, kind: "lake", polygon });
const provider = (polygon = box(-10, 10)): WaterAreaV1 => ({ ...lake("survey", polygon), outlineSource: "provider", outlineSourceId: "mn-dnr-lakes-v1", surveyId: "123" });
afterEach(() => vi.unstubAllGlobals());

describe("shoreline priority", () => {
  it("keeps surveyed lake outlines without HydroLAKES IDs or depth estimates", () => {
    expect(resolveLakeOutlines([provider()], [], [])).toEqual([provider()]);
    expect(resolveLakeOutlines([], [lake("hydro")], [])).toEqual([lake("hydro")]);
  });
  it("prefers provider geometry and retains HydroLAKES depth metadata without duplicate OSM shores", () => {
    const hydro = { ...lake("hydro"), hylakId: 123, maxDepthM: 40 };
    const result = resolveLakeOutlines([provider(box(-11, 11))], [hydro], [box(-12, 12)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "survey", hylakId: 123, maxDepthM: 40, polygon: box(-11, 11) });
  });
  it("keeps the complete lake when provider coverage is only a bay", () => {
    expect(resolveLakeOutlines([provider(box(-2, 2))], [lake("hydro")], [])).toEqual([lake("hydro")]);
    const result = resolveLakeOutlines([provider(box(-2, 2))], [], [box(-10, 10)]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ outlineSource: "osm", polygon: box(-10, 10) });
  });
  it("leaves out map water the clipper cannot compare, and keeps the rest", () => {
    // polygon-clipping throws on some near-degenerate slivers; one must not cost the map its water.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const intersection = vi.spyOn(polygonClipping, "intersection").mockImplementationOnce(() => { throw new Error("Unable to find segment in SweepLine tree."); });
    const result = resolveLakeOutlines([provider()], [], [box(-12, 12), box(20, 40)]);
    expect(result.map((item) => item.id)).toEqual(["survey", "osm-lake-1"]);
    intersection.mockRestore();
  });
  it("adds unmatched OSM water and preserves islands without inventing depths", () => {
    const shape = { ...box(20, 40), holes: [box(25, 30).outer] };
    const result = resolveLakeOutlines([provider()], [], [shape]);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ outlineSource: "osm", polygon: shape });
    expect(result[1]?.maxDepthM).toBeUndefined();
  });
  it("does not expand a small HydroLAKES basin's estimated depth over a larger provider lake", () => {
    const result = resolveLakeOutlines([provider(box(-20, 20))], [{ ...lake("hydro"), hylakId: 1, maxDepthM: 100 }], []);
    expect(result).toHaveLength(1);
    expect(result[0]?.maxDepthM).toBeUndefined();
    expect(result[0]?.hylakId).toBeUndefined();
  });
  it("does not give each survey basin the whole lake's estimated depth", () => {
    const left = { ...provider(), polygon: { outer: [{ x: -10, y: -10 }, { x: 0, y: -10 }, { x: 0, y: 10 }, { x: -10, y: 10 }, { x: -10, y: -10 }], holes: [] } };
    const right = { ...left, id: "right", polygon: { outer: left.polygon.outer.map((p) => ({ x: -p.x, y: p.y })), holes: [] } };
    const result = resolveLakeOutlines([left, right], [{ ...lake("hydro"), maxDepthM: 100 }], []);
    expect(result).toHaveLength(2);
    expect(result.every((area) => area.maxDepthM === undefined)).toBe(true);
  });
});

describe("provider outline assets", () => {
  const file = "0123456789abcdef01234567.json";
  const bounds = { west: -1, east: 1, south: -1, north: 1 };
  const config = { ...DEFAULT_PROJECT, widthMm: 100, heightMm: 100, minimumFeatureMm: 0.1 };
  const feature = { bbox: [-0.5, -0.5, 0.5, 0.5], properties: { sourceId: "mn-dnr-lakes-v1", surveyId: "123", name: "Survey lake" }, geometry: { type: "Polygon", coordinates: [[[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5],[-0.5,-0.5]], [[-0.1,-0.1],[-0.1,0.1],[0.1,0.1],[0.1,-0.1],[-0.1,-0.1]]] } };
  function mockFetch() {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ schemaVersion: 1, shards: [
      { file, bounds: [-1,-1,1,1] }, { file: "ffffffffffffffffffffffff.json", bounds: [20,20,21,21] },
    ] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ features: [feature] }) });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }
  it("loads only intersecting shards, projects shores and preserves island holes", async () => {
    const fetch = mockFetch();
    const areas = await loadProviderOutlines("/app", bounds, config);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[0]).toBe(`/app/v1/lake-outlines/${release.index.file}`);
    expect(fetch.mock.calls[1]?.[0]).toBe(`/app/v1/lake-outlines/${file}`);
    expect(areas).toHaveLength(1);
    expect(areas[0]).toMatchObject({ name: "Survey lake", surveyId: "123", outlineSource: "provider", clipped: false });
    expect(areas[0]?.polygon.holes).toHaveLength(1);
    expect(Math.max(...areas[0]!.polygon.outer.map((p) => p.x))).toBeCloseTo(25);
  });
  it("keeps the real shoreline beyond the crop instead of scoring the crop edge", async () => {
    mockFetch();
    const areas = await loadProviderOutlines("", { west: -0.2, east: 0.2, south: -0.2, north: 0.2 }, config);
    expect(areas[0]?.clipped).toBe(true);
    expect(Math.max(...areas[0]!.polygon.outer.map((p) => p.x))).toBeGreaterThan(config.widthMm / 2);
  });
  it("propagates asset failures and cancellation for retries", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(loadProviderOutlines("", bounds, config)).rejects.toThrow("could not be loaded");
    mockFetch();
    const controller = new AbortController(); controller.abort();
    await expect(loadProviderOutlines("", bounds, config, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("rejects unsupported assets and excessive request windows", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 2, shards: [] }) }));
    await expect(loadProviderOutlines("", bounds, config)).rejects.toThrow("Unknown");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 1, shards: Array.from({ length: 65 }, () => ({ bounds: [-1,-1,1,1], file })) }) }));
    await expect(loadProviderOutlines("", bounds, config)).rejects.toThrow("Narrow");
  });
});
