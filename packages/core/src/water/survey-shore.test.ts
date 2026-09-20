import { describe, expect, it } from "vitest";
import fixture from "./fixtures/bergen-survey.json";
import { carveWaterDepth } from "./water.js";
import { smoothLakePolygon } from "./lake-shoreline.js";
import { surveyShoreDepths } from "./survey-shore.js";
import { DEFAULT_PROJECT } from "../types.js";

const size = fixture.width * fixture.height;
const depthsM = new Float32Array(size).fill(Number.NaN);
fixture.samples.forEach(([i, depth]) => { depthsM[i!] = depth!; });
const groundWidth = (fixture.bounds.east - fixture.bounds.west) * Math.PI / 180 * 6_371_008.8 * Math.cos((fixture.bounds.north + fixture.bounds.south) / 2 * Math.PI / 180);
const config = { ...DEFAULT_PROJECT, widthMm: 200, heightMm: 200, waterDepthExaggeration: 1 };
const lake = { id: "nve-144518", kind: "lake" as const, outlineSource: "provider" as const,
  polygon: smoothLakePolygon(fixture.polygon, config.minimumFeatureMm),
  bathymetry: { width: fixture.width, height: fixture.height, depthsM, sampleSpacingM: fixture.sampleSpacingM } };
const grid = { width: fixture.width, height: fixture.height, values: new Float32Array(size).fill(100), min: 100, max: 100 };

describe("sparse survey shoreline gaps", () => {
  it("removes the NVE survey-edge depth jump without changing supplied samples or land", () => {
    const old = carveWaterDepth(grid, { ...config, smoothing: 0 }, [lake], groundWidth, groundWidth);
    const result = carveWaterDepth(grid, config, [lake], groundWidth, groundWidth);
    let oldJump = 0, newJump = 0, count = 0;
    result.grid.values.forEach((value, i) => {
      if (!result.waterMask[i]) { expect(value).toBe(100); return; }
      if (Number.isFinite(depthsM[i])) expect(value).toBe(old.grid.values[i]);
      else for (const step of [-1, 1, -fixture.width, fixture.width]) {
        const n = i + step;
        if (!result.waterMask[n] || !Number.isFinite(depthsM[n])) continue;
        oldJump += Math.abs(old.grid.values[i]! - old.grid.values[n]!);
        newJump += Math.abs(value - result.grid.values[n]!);
        count += 1;
      }
    });
    expect(count).toBeGreaterThan(100);
    expect(newJump / count).toBeLessThan(oldJump / count * 0.5);
    expect(result.grid.min).toBe(old.grid.min);
    expect(result.surfaces[0]!.depthSource).toBe("mixed");
    expect(grid.values.every(value => value === 100)).toBe(true);
    fixture.samples.forEach(([i, depth]) => expect(depthsM[i!]).toBe(depth));
  });

  it("keeps remote gaps unknown and does not interpolate through dry barriers", () => {
    const width = 31, height = 31, count = width * height;
    const mask = new Uint8Array(count).fill(1), distances = new Float64Array(count).fill(1);
    const depths = new Float32Array(count).fill(Number.NaN);
    const measured = 15 * width + 14;
    depths[measured] = 10;
    for (let y = 0; y < height; y += 1) mask[y * width + 15] = 0;
    const cells = Array.from(mask.keys()).filter(i => mask[i]);
    const result = surveyShoreDepths(depths, mask, cells, distances, width, height, 1, 1, 3);
    expect(result[measured - 1]).toBeGreaterThan(0);
    expect(result[measured + 2]).toBeNaN();
    expect(result[0]).toBeNaN();
    expect(result[measured]).toBeNaN();
    distances[measured - 1] = 20;
    expect(surveyShoreDepths(depths, mask, cells, distances, width, height, 1, 1, 3)[measured - 1]).toBeNaN();
  });
});
