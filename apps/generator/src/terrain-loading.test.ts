import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT, generateGeometry, buildProjectPackage } from "@topostack/core";
import { loadTerrain } from "./data-provider";

const terrainOnly = { ...DEFAULT_PROJECT, widthMm: 100, heightMm: 200, showRoads: false, showTrails: false, showWater: false, showWaterDepth: false, showBoundaries: false, showElevationLabels: false };

afterEach(() => vi.unstubAllGlobals());

describe("West Point terrain loading", () => {
  it.each([[12, 1206, 1529], [15, 9652, 12238]])("decodes and repairs zoom %s without canvas or image APIs", async (zoom, x, y) => {
    const png = readFileSync(new URL(`./fixtures/west-point-z${zoom}.png`, import.meta.url));
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(png, { headers: { "x-topostack-dataset": "west-point-fixture" } }));
    vi.stubGlobal("fetch", fetchMock);
    const blocked = vi.fn(() => { throw new Error("Canvas access blocked by browser privacy settings"); });
    vi.stubGlobal("OffscreenCanvas", blocked);
    vi.stubGlobal("createImageBitmap", blocked);
    const longitude = (tile: number) => tile / 2 ** zoom * 360 - 180;
    const latitude = (tile: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * tile / 2 ** zoom))) * 180 / Math.PI;
    const project = { ...terrainOnly, location: { lat: 41.3915, lon: -73.956, label: "West Point, NY", zoom, bounds: { west: longitude(x), east: longitude(x + 1), north: latitude(y), south: latitude(y + 1) } } };
    const result = await loadTerrain(project);
    expect(result.fallback).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/terrain/${zoom}/${x}/${y}.png`);
    expect(blocked).not.toHaveBeenCalled();
    expect(result.source.elevationRepairCount).toBeGreaterThan(100);
    expect(result.source.elevation.min).toBeGreaterThan(-100);
    expect(result.source.elevation.max).toBeLessThan(450);
    const geometry = generateGeometry(project, result.source);
    expect(geometry.minElevationM).toBeGreaterThan(-100);
    expect(geometry.maxElevationM - geometry.minElevationM).toBeLessThan(550);
    expect(geometry.warnings).toContainEqual(expect.objectContaining({ code: "ELEVATION_REPAIRED" }));
    const manifest = buildProjectPackage(geometry, project).files.find((file) => file.filename.endsWith("-project.json"));
    expect(JSON.parse(await manifest!.blob.text()).result.warnings).toContainEqual(expect.objectContaining({ code: "ELEVATION_REPAIRED" }));
  });

  it("does not mark malformed elevation data as real exportable terrain", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not a terrain PNG")));
    const result = await loadTerrain(terrainOnly);
    expect(result.fallback).toBe(true);
    expect(result.source.sourceKind).toBe("synthetic");
  });
});
