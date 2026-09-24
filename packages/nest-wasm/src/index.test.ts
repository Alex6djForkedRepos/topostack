import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadNestEngine, loadNestEngineSync, type StripJobV1, type StripProgressV1 } from "./index.ts";

const wasm = readFileSync(new URL("../pkg/topostack_nest_wasm_bg.wasm", import.meta.url));
const buildInfo = JSON.parse(readFileSync(new URL("../pkg/BUILD-INFO.json", import.meta.url), "utf8")) as { wasmSha256: string; crate: string };
const engine = loadNestEngineSync(wasm);

const square = (size: number): Array<[number, number]> => [
  [10, 10],
  [10 + size, 10],
  [10 + size, 10 + size],
  [10, 10 + size],
];

describe("committed nest engine", () => {
  it("matches its build record", () => {
    expect(createHash("sha256").update(wasm).digest("hex")).toBe(buildInfo.wasmSha256);
    expect(engine.info.crate).toBe(buildInfo.crate);
    expect(engine.info.sparrowRev).toMatch(/^[0-9a-f]{40}$/);
    expect(engine.info.jaguaVersion).toBe("0.8.3");
  });

  it("packs squares inside the strip and reports progress", () => {
    const job: StripJobV1 = {
      items: [0, 1, 2, 3].map(() => ({ outline: square(40), orientationsDeg: [0, 90] })),
      stripHeight: 100,
      spacing: 2,
      timeLimitMs: 600,
      seed: 1,
      reportIntervalMs: 0,
    };
    const progress: StripProgressV1[] = [];
    const result = engine.pack(job, (report) => progress.push(report));

    expect(result.placements.map((placement) => placement.index).sort()).toEqual([0, 1, 2, 3]);
    expect(result.stripWidth).toBeLessThanOrEqual(90);
    expect(progress.length).toBeGreaterThan(0);
    for (const placement of result.placements) {
      const radians = (placement.rotationDeg * Math.PI) / 180;
      for (const [x, y] of job.items[placement.index]?.outline ?? []) {
        const px = Math.cos(radians) * x - Math.sin(radians) * y + placement.x;
        const py = Math.sin(radians) * x + Math.cos(radians) * y + placement.y;
        expect(px).toBeGreaterThanOrEqual(-0.02);
        expect(px).toBeLessThanOrEqual(result.stripWidth + 0.02);
        expect(py).toBeGreaterThanOrEqual(-0.02);
        expect(py).toBeLessThanOrEqual(100.02);
      }
    }
  });

  it("loads asynchronously from bytes", async () => {
    const loaded = await loadNestEngine(wasm);
    expect(loaded.info).toEqual(engine.info);
  });

  it("throws a readable error for an impossible job", () => {
    expect(() => engine.pack({ items: [{ outline: square(200), orientationsDeg: [0] }], stripHeight: 100, timeLimitMs: 100 })).toThrow(/first layout/);
    expect(() => engine.pack({ items: [], stripHeight: 100, timeLimitMs: 100 })).toThrow(/no items/);
  });
});
