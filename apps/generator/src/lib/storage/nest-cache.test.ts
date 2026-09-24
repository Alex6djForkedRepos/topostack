import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SHEET_NESTING, type SheetNestPlanV1 } from "@topostack/core";

const store = vi.hoisted(() => new Map<string, unknown>());
const failing = vi.hoisted(() => ({ enabled: false }));
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => { if (failing.enabled) throw new Error("Storage is blocked"); return store.get(key); }),
  set: vi.fn(async (key: string, value: unknown) => { if (failing.enabled) throw new Error("Storage is blocked"); store.set(key, value); }),
  del: vi.fn(async (key: string) => { store.delete(key); }),
}));

const { MAX_CACHED_NEST_PLANS, loadNestPlan, saveNestPlan, setNestPlanChoice } = await import("$lib/storage/nest-cache");

const plan = (jobKey: string): SheetNestPlanV1 => ({
  schemaVersion: 1, jobKey, engine: { name: "sparrow" }, settings: { ...DEFAULT_SHEET_NESTING, sheetWidthMm: 400, sheetHeightMm: 300 },
  sheets: [{ placements: [], usedWidthMm: 100, method: "sparrow" }], final: true, utilization: 0.5, elapsedMs: 10,
});

describe("saved sheet layouts", () => {
  beforeEach(() => { store.clear(); failing.enabled = false; });

  it("finds a layout again by its job key, with the maker's choice", async () => {
    await saveNestPlan(plan("nest1-a"), true, 5);
    expect(await loadNestPlan("nest1-a")).toEqual({ plan: plan("nest1-a"), useSheets: true, savedAt: 5 });
    await setNestPlanChoice("nest1-a", false);
    expect((await loadNestPlan("nest1-a"))?.useSheets).toBe(false);
    expect(await loadNestPlan("nest1-b")).toBeUndefined();
  });

  it("ignores an entry filed under the wrong key or in another shape", async () => {
    store.set("nest-plan:nest1-a", { plan: plan("nest1-other"), useSheets: true, savedAt: 1 });
    expect(await loadNestPlan("nest1-a")).toBeUndefined();
    store.set("nest-plan:nest1-b", { plan: { schemaVersion: 2, jobKey: "nest1-b" } });
    expect(await loadNestPlan("nest1-b")).toBeUndefined();
  });

  it("keeps only the most recent layouts", async () => {
    for (let index = 0; index < MAX_CACHED_NEST_PLANS + 2; index += 1) await saveNestPlan(plan(`nest1-${index}`), true);
    expect(await loadNestPlan("nest1-0")).toBeUndefined();
    expect(await loadNestPlan("nest1-1")).toBeUndefined();
    expect(await loadNestPlan(`nest1-${MAX_CACHED_NEST_PLANS + 1}`)).toBeDefined();
    expect((store.get("nest-plan-index") as string[]).length).toBe(MAX_CACHED_NEST_PLANS);
    // Saving an existing layout again moves it to the back of the queue.
    await saveNestPlan(plan("nest1-2"), true);
    expect((store.get("nest-plan-index") as string[]).at(-1)).toBe("nest1-2");
  });

  it("carries on when storage is blocked", async () => {
    failing.enabled = true;
    await expect(saveNestPlan(plan("nest1-a"), true)).resolves.toBeUndefined();
    await expect(loadNestPlan("nest1-a")).resolves.toBeUndefined();
    await expect(setNestPlanChoice("nest1-a", false)).resolves.toBeUndefined();
  });
});
