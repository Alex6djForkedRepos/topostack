import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT } from "../../types.js";
import { DEFAULT_SHEET_NESTING, allowedOrientations, resolveSheetNestSettings } from "./resolve.js";

describe("sheet nesting settings", () => {
  it("falls back to the machine work area per axis", () => {
    const result = resolveSheetNestSettings({ ...DEFAULT_PROJECT, workAreaWidthMm: 400, workAreaHeightMm: 300, sheetNesting: { ...DEFAULT_SHEET_NESTING, sheetHeightMm: 250 } });
    expect(result).toEqual({ ok: true, settings: expect.objectContaining({ sheetWidthMm: 400, sheetHeightMm: 250, rotation: "quarter", spacingMm: 2 }) });
  });

  it("asks for a sheet size when neither a sheet nor a work area is set", () => {
    const result = resolveSheetNestSettings(DEFAULT_PROJECT);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/sheet size/);
  });

  it("clamps values into range and repairs invalid ones", () => {
    const result = resolveSheetNestSettings({
      ...DEFAULT_PROJECT,
      sheetNesting: { sheetWidthMm: 9000, sheetHeightMm: 100, marginMm: 80, spacingMm: -1, rotation: "sideways" as never, timeBudgetS: 1, seed: -3 },
    });
    expect(result.ok && result.settings).toEqual({ sheetWidthMm: 5000, sheetHeightMm: 100, marginMm: 25, spacingMm: 0, rotation: "quarter", timeBudgetS: 2, seed: 1 });
  });

  it("maps rotation modes to orientations", () => {
    expect(allowedOrientations("none")).toEqual([0]);
    expect(allowedOrientations("half")).toEqual([0, 180]);
    expect(allowedOrientations("quarter")).toEqual([0, 90, 180, 270]);
    expect(allowedOrientations("free")).toBeUndefined();
  });
});
