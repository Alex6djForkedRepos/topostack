import { describe, expect, it } from "vitest";
import { planTerrainStack } from "./stack-plan.js";
import { DEFAULT_PROJECT } from "../types.js";

const bounds = { west: -110.756, east: -110.708, south: 43.743, north: 43.780 };

describe("water depth in a mountain stack", () => {
  it("adds water sheets without compressing a mountain stack", () => {
    const dry = planTerrainStack(DEFAULT_PROJECT, 1800, bounds);
    const wet = planTerrainStack(DEFAULT_PROJECT, 1800, bounds, 46.4);
    expect(dry.layerCount).toBeGreaterThan(24);
    expect(dry.depthLayerCount).toBe(0);
    expect(wet.layerCount).toBe(dry.layerCount + wet.depthLayerCount);
    expect(wet.depthLayerCount).toBeGreaterThan(0);
    expect(wet.verticalExaggeration).toBe(dry.verticalExaggeration);
    expect(wet.metersPerLayer).toBe(dry.metersPerLayer);
    expect(wet.depthLayerCount * wet.metersPerLayer).toBeGreaterThanOrEqual(46.4);
    expect(wet.metersPerLayer * (wet.layerCount - wet.depthLayerCount)).toBeCloseTo(1800);
  });

  it("gives exaggerated depth more sheets while preserving the land scale", () => {
    const plan = planTerrainStack({ ...DEFAULT_PROJECT, waterDepthExaggeration: 4 }, 1800, bounds, 46.4 * 4);
    expect(plan.depthLayerCount).toBeGreaterThan(1);
    expect(plan.layerCount - plan.depthLayerCount).toBe(planTerrainStack(DEFAULT_PROJECT, 1800, bounds).layerCount);
    expect(plan.depthLayerCount * plan.metersPerLayer).toBeGreaterThanOrEqual(46.4 * 4);
    expect(plan.metersPerLayer * (plan.layerCount - plan.depthLayerCount)).toBeCloseTo(1800);
  });

  it("covers deep water automatically without a hidden sheet cap", () => {
    const plan = planTerrainStack(DEFAULT_PROJECT, 1800, bounds, 10000);
    const dry = planTerrainStack(DEFAULT_PROJECT, 1800, bounds);
    expect(plan.depthLayerCount).toBeGreaterThan(24);
    expect(plan.depthLayerCount * plan.metersPerLayer).toBeGreaterThanOrEqual(10000);
    expect(plan.layerCount).toBe(dry.layerCount + plan.depthLayerCount);
    expect(plan.verticalExaggeration).toBe(dry.verticalExaggeration);
  });

  it("honors a chosen depth allowance without changing the land scale", () => {
    for (const limit of [1, 6, 12, 40]) {
      const plan = planTerrainStack({ ...DEFAULT_PROJECT, waterDepthLayerLimit: limit }, 1800, bounds, 10000);
      const dry = planTerrainStack(DEFAULT_PROJECT, 1800, bounds);
      expect(plan.depthLayerCount).toBe(limit);
      expect(plan.layerCount).toBe(dry.layerCount + limit);
      expect(plan.verticalExaggeration).toBe(dry.verticalExaggeration);
    }
  });

  it("preserves water depth even when the surrounding land is flat", () => {
    const automatic = planTerrainStack(DEFAULT_PROJECT, 0, bounds, 1000);
    expect(automatic.depthLayerCount).toBeGreaterThan(6);
    expect(automatic.depthLayerCount * automatic.metersPerLayer).toBeGreaterThanOrEqual(1000);
    expect(automatic.layerCount).toBe(automatic.depthLayerCount + 1);
    expect(automatic.verticalExaggeration).toBe(DEFAULT_PROJECT.verticalExaggeration);
    const limited = planTerrainStack({ ...DEFAULT_PROJECT, waterDepthLayerLimit: 3 }, 0, bounds, 1000);
    expect(limited.depthLayerCount).toBe(3);
    expect(limited.metersPerLayer).toBe(automatic.metersPerLayer);
  });

  it("leaves the land-only plan unchanged for absent or invalid water depth", () => {
    const dry = planTerrainStack(DEFAULT_PROJECT, 1800, bounds);
    for (const depth of [0, -10, Number.NaN, Infinity]) expect(planTerrainStack(DEFAULT_PROJECT, 1800, bounds, depth)).toEqual(dry);
  });
});
