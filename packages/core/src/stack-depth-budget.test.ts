import { describe, expect, it } from "vitest";
import { planTerrainStack } from "./geometry.js";
import { DEFAULT_PROJECT, MAX_DEPTH_LAYER_COUNT, MAX_LAYER_COUNT } from "./types.js";

const bounds = { west: -110.756, east: -110.708, south: 43.743, north: 43.780 };

describe("water depth in a mountain stack", () => {
  it("reserves a depth sheet when the mountains already fill the stack", () => {
    const dry = planTerrainStack(DEFAULT_PROJECT, 1800, bounds);
    const wet = planTerrainStack(DEFAULT_PROJECT, 1800, bounds, 46.4);
    expect(dry.layerCount).toBe(MAX_LAYER_COUNT);
    expect(dry.depthLayerCount).toBe(0);
    expect(wet.layerCount).toBe(MAX_LAYER_COUNT);
    expect(wet.depthLayerCount).toBe(1);
    expect(wet.depthLayerCount * wet.metersPerLayer).toBeGreaterThanOrEqual(46.4);
    expect(wet.metersPerLayer * (wet.layerCount - wet.depthLayerCount)).toBeCloseTo(1800);
  });

  it("gives exaggerated depth more sheets while preserving the total limit and a uniform scale", () => {
    const plan = planTerrainStack({ ...DEFAULT_PROJECT, waterDepthExaggeration: 4 }, 1800, bounds, 46.4 * 4);
    expect(plan.depthLayerCount).toBeGreaterThan(1);
    expect(plan.layerCount).toBeLessThanOrEqual(MAX_LAYER_COUNT);
    expect(plan.depthLayerCount * plan.metersPerLayer).toBeGreaterThanOrEqual(46.4 * 4);
    expect(plan.metersPerLayer * (plan.layerCount - plan.depthLayerCount)).toBeCloseTo(1800);
  });

  it("keeps the deep-water cap so an abyss cannot consume the land sheets", () => {
    const plan = planTerrainStack(DEFAULT_PROJECT, 1800, bounds, 10000);
    expect(plan.layerCount).toBe(MAX_LAYER_COUNT);
    expect(plan.depthLayerCount).toBe(MAX_DEPTH_LAYER_COUNT);
  });

  it("leaves the land-only plan unchanged for absent or invalid water depth", () => {
    const dry = planTerrainStack(DEFAULT_PROJECT, 1800, bounds);
    for (const depth of [0, -10, Number.NaN, Infinity]) expect(planTerrainStack(DEFAULT_PROJECT, 1800, bounds, depth)).toEqual(dry);
  });
});
