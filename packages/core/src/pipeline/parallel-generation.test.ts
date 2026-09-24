import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, type GeometryIRV1 } from "../types.js";
import { createParallelGeometryGenerator, generateGeometry } from "./generate.js";
import { executeGeometryTask, type GeometryBatch } from "./generation-tasks.js";
import { createSyntheticSource } from "./synthetic-source.js";

const comparable = (result: GeometryIRV1) => ({ ...result, generatedAt: "" });
const config = { ...DEFAULT_PROJECT, widthMm: 1200, heightMm: 1200 };
const execute = async (batch: GeometryBatch) => {
  // Cross a real serialization boundary, then deliberately vary completion order.
  const copy = structuredClone(batch);
  const completed = await Promise.all(copy.tasks.map(async (task, index) => {
    await new Promise(resolve => setTimeout(resolve, (copy.tasks.length - index) % 4));
    return executeGeometryTask(copy.config, task);
  }));
  expect(batch).toEqual(copy); // task kernels must not mutate their inputs
  return completed;
};

describe("parallel generation stages", () => {
  it("matches synchronous output including roads, split pieces, and cached edits", async () => {
    const source = createSyntheticSource(config, 64);
    source.markings = [{ id: "road", kind: "road", operation: "engrave", points: [{ x: -500, y: 10 }, { x: 500, y: 200 }] }];
    const generate = createParallelGeometryGenerator();
    const stages: string[] = [];
    for (const project of [config, { ...config, showElevationLabels: false }, { ...config, workAreaWidthMm: 650, workAreaHeightMm: 650 }]) {
      const result = await generate(project, source, { execute: async batch => { stages.push(batch.tasks[0]!.kind); return execute(batch); } });
      expect(comparable(result)).toEqual(comparable(generateGeometry(project, source)));
    }
    expect(stages).toContain("alignment");
    expect(stages).toContain("elevation-labels");
  }, 20_000);

  it("keeps small maps and shared-face engravings on the synchronous path", async () => {
    for (const project of [DEFAULT_PROJECT, { ...config, outputMode: "engraving" as const, engravingContourCount: 40 }]) {
      const source = createSyntheticSource(project, 48);
      const result = await createParallelGeometryGenerator()(project, source, { execute: async () => { throw new Error("Unexpected worker batch"); } });
      expect(comparable(result)).toEqual(comparable(generateGeometry(project, source)));
    }
  });

  it("cancels between stages and reuses the session safely", async () => {
    const generate = createParallelGeometryGenerator(), source = createSyntheticSource(config, 48);
    let cancelled = false;
    const checkCancelled = () => { if (cancelled) throw new Error("cancelled"); };
    await expect(generate(config, source, { checkCancelled, execute: async batch => { cancelled = true; return execute(batch); } })).rejects.toThrow("cancelled");
    const result = await generate(config, source, { execute });
    expect(comparable(result)).toEqual(comparable(generateGeometry(config, source)));
  });

  it("rejects overlapping requests and incomplete task results", async () => {
    const generate = createParallelGeometryGenerator(), source = createSyntheticSource(config, 48);
    let release!: () => void;
    let first = true;
    const pending = generate(config, source, { execute: async batch => { if (first) { first = false; await new Promise<void>(resolve => { release = resolve; }); } return batch.tasks.map(task => executeGeometryTask(batch.config, task)); } });
    await expect(generate(config, source, { execute })).rejects.toThrow("overlapping");
    release();
    await pending;
    await expect(generate(config, source, { execute: async () => [] })).rejects.toThrow("Incomplete alignment");
  });
});
