import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT, type GeometryIRV1, type SheetNestPlanV1 } from "@topostack/core";
import { AutomaticNesting, automaticNestProject } from "./automatic-nesting";

type Runner = typeof import("$lib/studio/sheet-nest-runner");
const geometry = {} as GeometryIRV1;
const plan = { settings: { sheetWidthMm: 600, sheetHeightMm: 400 }, sheets: [{}] } as SheetNestPlanV1;
function harness() {
  let resolve!: (value: SheetNestPlanV1) => void;
  let reject!: (error: Error) => void;
  const run = vi.fn(() => new Promise<SheetNestPlanV1>((yes, no) => { resolve = yes; reject = no; }));
  const cancel = vi.fn(() => reject?.(new DOMException("Cancelled", "AbortError")));
  const stop = vi.fn(() => resolve(plan));
  const dispose = vi.fn();
  const prepareNestJob = vi.fn(() => ({ ok: true, parts: [], settings: {} }));
  const runner = { NestClient: class { run = run; cancel = cancel; stop = stop; dispose = dispose; }, prepareNestJob } as unknown as Runner;
  const load = vi.fn(async () => runner);
  const service = new AutomaticNesting(load, 100);
  return { service, run, cancel, stop, dispose, prepareNestJob, load, runner, finish: () => resolve(plan), fail: (error: Error) => reject(error) };
}
afterEach(() => vi.useRealTimers());

describe("automatic Atomm nesting", () => {
  it("uses export-only defaults and the work area without changing imported settings", () => {
    const project = { ...DEFAULT_PROJECT, sheetNesting: { ...automaticNestProject(DEFAULT_PROJECT).sheetNesting!, sheetWidthMm: 900 } };
    expect(automaticNestProject(project).sheetNesting).toEqual({ sheetWidthMm: 600, sheetHeightMm: 400, marginMm: 3, spacingMm: 2, rotation: "quarter", timeBudgetS: 5, seed: 1 });
    expect(automaticNestProject({ ...project, workAreaWidthMm: 300, workAreaHeightMm: 200 }).sheetNesting).toMatchObject({ sheetWidthMm: 300, sheetHeightMm: 200 });
    expect(project.sheetNesting.sheetWidthMm).toBe(900);
  });
  it("shares one search and plan across export consumers while retaining current metadata", async () => {
    const h = harness();
    const first = h.service.prepare(geometry, DEFAULT_PROJECT);
    const second = h.service.prepare(geometry, { ...DEFAULT_PROJECT, name: "Renamed" });
    await Promise.resolve();
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.run).toHaveBeenCalledWith([], {}, { budgetMs: 5000 });
    h.finish();
    expect((await first).sheetPlan).toBe(plan);
    expect(await second).toMatchObject({ project: { name: "Renamed" }, layoutNote: "Automatic layout · 1 sheet · 600 × 400 mm" });
    expect((await h.service.prepare(geometry, DEFAULT_PROJECT)).sheetPlan).toBe(plan);
    expect(h.run).toHaveBeenCalledTimes(1);
  });
  it("bypasses the planner for engraving", async () => {
    const h = harness();
    const project = { ...DEFAULT_PROJECT, outputMode: "engraving" as const };
    expect(await h.service.prepare(geometry, project)).toEqual({ project, layoutNote: "" });
    expect(h.load).not.toHaveBeenCalled();
  });
  it("rejects obsolete geometry and starts a fresh search", async () => {
    const h = harness();
    const first = h.service.prepare(geometry, DEFAULT_PROJECT);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    const second = h.service.prepare({ ...geometry }, DEFAULT_PROJECT);
    await Promise.resolve();
    h.finish();
    await rejected;
    expect((await second).sheetPlan).toBe(plan);
    expect(h.run).toHaveBeenCalledTimes(2);
  });
  it("does not start a cancelled search after a slow import", async () => {
    const h = harness();
    let resolve!: (runner: Runner) => void;
    const service = new AutomaticNesting(() => new Promise(yes => { resolve = yes; }));
    const pending = service.prepare(geometry, DEFAULT_PROJECT);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    service.dispose();
    resolve(h.runner);
    await rejected;
    expect(h.run).not.toHaveBeenCalled();
  });
  it("stops at a complete draft when the optimizer exceeds its deadline", async () => {
    vi.useFakeTimers();
    const h = harness();
    const pending = h.service.prepare(geometry, DEFAULT_PROJECT);
    await vi.advanceTimersByTimeAsync(100);
    expect((await pending).sheetPlan).toBe(plan);
    expect(h.stop).toHaveBeenCalledOnce();
  });
  it.each(["oversize", "unavailable"])("retains original panels with an explanation for %s", async code => {
    const h = harness();
    const pending = h.service.prepare(geometry, DEFAULT_PROJECT);
    await Promise.resolve();
    h.fail(Object.assign(new Error("Failed"), { code }));
    const result = await pending;
    expect(result.project).toBe(DEFAULT_PROJECT);
    expect(result.sheetPlan).toBeUndefined();
    expect(result.layoutNote).toContain("Using original panels");
    if (code === "oversize") expect(result.layoutNote).toContain("exceed");
  });
});
