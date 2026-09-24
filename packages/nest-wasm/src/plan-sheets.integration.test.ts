import { readFileSync } from "node:fs";
import { createSyntheticSource, DEFAULT_PROJECT, generateGeometry, nestableParts, planSheets, resolveSheetNestSettings, verifySheetPlan, type SheetNestPlanV1, type StripEngine } from "@topostack/core";
import { describe, expect, it } from "vitest";
import { loadNestEngineSync } from "./index.ts";

// The committed engine driving core's sheet planner end to end, as the studio's nest worker will.
const nest = loadNestEngineSync(readFileSync(new URL("../pkg/topostack_nest_wasm_bg.wasm", import.meta.url)));
const sparrow: StripEngine = { name: "sparrow", info: nest.info, pack: (job) => nest.pack(job) };

describe("sheet planning with sparrow", () => {
  it("packs a split model onto fewer or equal sheets than bounding boxes, every layout valid", async () => {
    const project = { ...DEFAULT_PROJECT, workAreaWidthMm: 160, workAreaHeightMm: 120 };
    const ir = generateGeometry(project, createSyntheticSource(project, 48));
    const parts = nestableParts(ir);
    const resolved = resolveSheetNestSettings({ ...project, sheetNesting: { sheetWidthMm: 400, sheetHeightMm: 300, marginMm: 3, spacingMm: 2, rotation: "quarter", timeBudgetS: 8, seed: 1 } });
    if (!resolved.ok) throw new Error(resolved.error);
    const drafts: SheetNestPlanV1[] = [];
    const plan = await planSheets(parts, resolved.settings, { engine: sparrow, onPlan: (draft) => drafts.push(draft) });

    expect(parts.length).toBeGreaterThan(5);
    expect(verifySheetPlan(parts, plan)).toEqual([]);
    expect(plan.final).toBe(true);
    expect(plan.sheets.length).toBeLessThanOrEqual(drafts[0]!.sheets.length);
    // The budget, plus at most the minimum probe that may start just before the deadline.
    expect(plan.elapsedMs).toBeLessThan(8000 + 1500);
    if (plan.engine.name === "sparrow") expect(plan.engine.jaguaVersion).toBe("0.8.3");
  }, 60_000);
});
