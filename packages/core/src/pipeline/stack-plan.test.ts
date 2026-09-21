import { describe, expect, it } from "vitest";
import { buildFabricationPackage, DEFAULT_PROJECT, generateGeometry, MIN_LAYER_COUNT, planTerrainStack } from "../index.js";
import { gridSource, groundBounds, realSource, scaledForLayers } from "../test-support/sources.js";

describe("terrain stack planning", () => {
  it("derives the layer count from map scale, relief, and material thickness", () => {
    // 1000 m of relief across 20 km of ground on a 200 mm cut is a 1:100,000
    // map, so true-scale relief is 10 mm and 2x exaggeration is 20 mm of stack.
    const project = { ...DEFAULT_PROJECT, widthMm: 200, materialThicknessMm: 4, verticalExaggeration: 2 };
    const bounds = groundBounds(project, 20_000);
    const plan = planTerrainStack(project, 1_000, bounds);
    expect(plan.stackHeightMm).toBeCloseTo(20, 6);
    expect(plan.layerCount).toBe(5);
    expect(plan.verticalExaggeration).toBeCloseTo(2, 6);
    expect(plan.metersPerLayer).toBeCloseTo(200, 6);
    expect(Math.round(1 / plan.horizontalScale)).toBe(100_000);

    // Thicker sheets divide the same physical stack into fewer of them; the
    // model does not grow taller.
    const thick = planTerrainStack({ ...project, materialThicknessMm: 10 }, 1_000, bounds);
    expect(thick.layerCount).toBe(2);
    expect(thick.stackHeightMm).toBeCloseTo(20, 6);

    // Doubling the cut doubles the map scale, so the stack doubles with it.
    const wide = planTerrainStack({ ...project, widthMm: 400 }, 1_000, bounds);
    expect(wide.stackHeightMm).toBeCloseTo(40, 6);
    expect(wide.layerCount).toBe(10);
  });

  it("honors tall stacks and only refits to whole sheets or the minimum", () => {
    const project = { ...DEFAULT_PROJECT, widthMm: 400, materialThicknessMm: 3, verticalExaggeration: 10 };
    const steep = planTerrainStack(project, 4_000, groundBounds(project, 20_000));
    expect(steep.layerCount).toBe(267);
    // 4000 m over 20 km at 400 mm is 80 mm of true relief. The requested
    // 800 mm rounds to 267 sheets of 3 mm, rather than flattening at 24.
    expect(steep.stackHeightMm).toBe(801);
    expect(steep.verticalExaggeration).toBeCloseTo(10.0125, 6);

    const flat = planTerrainStack({ ...project, verticalExaggeration: 1 }, 5, groundBounds(project, 20_000));
    expect(flat.layerCount).toBe(MIN_LAYER_COUNT);
    expect(flat.verticalExaggeration).toBeGreaterThan(10);
  });

  it("generates and exports every sheet in a stack larger than 24 layers", async () => {
    const base = { ...DEFAULT_PROJECT, showWaterDepth: false, optimizeMaterialUse: false };
    const [project, data] = scaledForLayers(base, gridSource(base, 32, (x) => 600 + 500 * x), 60);
    const result = generateGeometry(project, data);
    expect(result.layers).toHaveLength(60);
    expect(result.verticalExaggeration).toBeCloseTo(project.verticalExaggeration, 8);
    expect(result.layers.at(-1)!.polygons.length).toBeGreaterThan(0);
    const output = buildFabricationPackage(result, project);
    const manifest = JSON.parse(await output.files.find(file => file.filename.endsWith("-project.json"))!.blob.text());
    expect(manifest.result.layers).toHaveLength(60);
    const readme = await output.files.find(file => file.filename === "README.txt")!.blob.text();
    expect(readme).toContain("60 layers");
    expect(readme).toContain("180 mm");
    expect(await output.master.blob.text()).toContain('layer-60');
  });

  it("falls back to the minimum stack for degenerate terrain and bounds", () => {
    const project = { ...DEFAULT_PROJECT, widthMm: 200, materialThicknessMm: 3 };
    const flat = planTerrainStack(project, 0, groundBounds(project, 20_000));
    expect(flat.layerCount).toBe(MIN_LAYER_COUNT);
    expect(flat.horizontalScale).toBe(0);
    expect(Number.isFinite(flat.verticalExaggeration)).toBe(true);
    const pole = planTerrainStack(project, 1_000, { west: 10, south: 84.9, east: 10, north: 85 });
    expect(pole.layerCount).toBe(MIN_LAYER_COUNT);
    expect(pole.horizontalScale).toBe(0);
  });

  it("keeps the scale bar length and its engraved label in agreement", () => {
    const project = { ...DEFAULT_PROJECT, cropShape: "circle" as const, widthMm: 300, heightMm: 200 };
    const result = generateGeometry(project, realSource(project));
    const main = result.layers[0]!.markings.find((marking) => marking.id === "scale-main")!;
    const label = result.layers[0]!.markings.find((marking) => marking.id === "scale-label")!.label!;
    const lengthMm = Math.abs(main.points[1]!.x - main.points[0]!.x);
    const capMm = (Math.min(project.widthMm, project.heightMm) / 2) * 0.55;
    expect(lengthMm).toBeGreaterThan(0);
    expect(lengthMm).toBeLessThanOrEqual(capMm + 1e-6);
    const parsed = label.match(/^([\d.]+) (m|km)$/)!;
    const labeledM = Number(parsed[1]) * (parsed[2] === "km" ? 1000 : 1);
    const bounds = result.bounds;
    const groundWidthM = Math.abs(bounds.east - bounds.west) * (Math.PI / 180) * 6_371_008.8 * Math.cos(((bounds.north + bounds.south) / 2) * (Math.PI / 180));
    expect((lengthMm / project.widthMm) * groundWidthM).toBeCloseTo(labeledM, 3);
  });
});
