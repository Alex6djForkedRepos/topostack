import { DEFAULT_PROJECT, DEFAULT_SHEET_NESTING, type GeometryIRV1, type SheetNestPlanV1 } from "@topostack/core";
import { describe, expect, it, vi } from "vitest";
import { SheetNesting } from "$lib/studio/sheet-nesting.svelte";
import type { NestRunOptions } from "$lib/workers/nest-client";

const settings = { ...DEFAULT_SHEET_NESTING, sheetWidthMm: 300, sheetHeightMm: 200 };
const plan = (final: boolean): SheetNestPlanV1 => ({ schemaVersion: 1, jobKey: "nest1-x", engine: { name: "sparrow" }, settings, sheets: [], final, utilization: 0.5, elapsedMs: 10 });
const geometry = {} as GeometryIRV1;

function fakeRunner(overrides: { run?: (options: NestRunOptions) => Promise<SheetNestPlanV1>; job?: unknown; current?: boolean } = {}) {
  const client = { run: vi.fn((_parts: unknown, _settings: unknown, options: NestRunOptions) => overrides.run?.(options) ?? Promise.resolve(plan(true))), stop: vi.fn(), cancel: vi.fn(), dispose: vi.fn() };
  const runner = {
    NestClient: vi.fn(function NestClient() { return client; }),
    NestJobError: Error,
    prepareNestJob: vi.fn(() => overrides.job ?? { ok: true, parts: [], settings }),
    planIsCurrent: vi.fn(() => overrides.current ?? true),
    sheetPreviews: vi.fn(() => [{ widthMm: 300, heightMm: 200, provisional: false, usedWidthMm: 100, parts: [] }]),
  };
  return { runner, client, load: () => Promise.resolve(runner as never) };
}

describe("SheetNesting", () => {
  it("runs a job, shows drafts, and exports the final plan once chosen", async () => {
    let draft: ((plan: SheetNestPlanV1) => void) | undefined;
    let finish: ((plan: SheetNestPlanV1) => void) | undefined;
    const { load } = fakeRunner({ run: (options) => new Promise((resolve) => { draft = options.onDraft; finish = resolve; }) });
    const nesting = new SheetNesting(load, () => 1000);
    const running = nesting.start(geometry, DEFAULT_PROJECT);
    await vi.waitFor(() => expect(nesting.status).toBe("running"));
    expect(nesting.budgetMs).toBe(30_000);
    draft!(plan(false));
    expect(nesting.plan?.final).toBe(false);
    expect(nesting.previews).toHaveLength(1);
    expect(nesting.exportPlan).toBeUndefined();
    finish!(plan(true));
    await running;
    expect(nesting.status).toBe("done");
    expect(nesting.useSheets).toBe(true);
    expect(nesting.exportPlan?.final).toBe(true);
    nesting.useSheets = false;
    expect(nesting.exportPlan).toBeUndefined();
  });

  it("reports a job that cannot start", async () => {
    const { load } = fakeRunner({ job: { ok: false, error: "Set a sheet size." } });
    const nesting = new SheetNesting(load);
    await nesting.start(geometry, DEFAULT_PROJECT);
    expect(nesting.status).toBe("error");
    expect(nesting.error).toBe("Set a sheet size.");
  });

  it("returns to idle on cancel and reports engine errors", async () => {
    const abort = new DOMException("cancelled", "AbortError");
    const cancelled = fakeRunner({ run: () => Promise.reject(abort) });
    const nesting = new SheetNesting(cancelled.load);
    await nesting.start(geometry, DEFAULT_PROJECT);
    expect(nesting.status).toBe("idle");
    const failing = fakeRunner({ run: () => Promise.reject(new Error("L01 is larger than the sheet.")) });
    const other = new SheetNesting(failing.load);
    await other.start(geometry, DEFAULT_PROJECT);
    expect(other.status).toBe("error");
    expect(other.error).toMatch(/larger/);
  });

  it("marks a plan stale when the design or settings change, and forgets it on cancel", async () => {
    const { load, runner, client } = fakeRunner();
    const nesting = new SheetNesting(load);
    await nesting.start(geometry, DEFAULT_PROJECT);
    expect(nesting.exportPlan).toBeDefined();
    runner.planIsCurrent.mockReturnValue(false);
    await nesting.refresh(geometry, DEFAULT_PROJECT);
    expect(nesting.current).toBe(false);
    expect(nesting.exportPlan).toBeUndefined();
    nesting.stop();
    expect(client.stop).toHaveBeenCalled();
    nesting.cancel();
    expect(nesting.plan).toBeUndefined();
    expect(nesting.previews).toEqual([]);
    nesting.dispose();
    expect(client.dispose).toHaveBeenCalled();
  });
});
