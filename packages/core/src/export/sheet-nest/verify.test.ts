import { describe, expect, it } from "vitest";
import type { NestPartV1, ResolvedSheetNestSettings } from "../../types.js";
import { DEFAULT_SHEET_NESTING } from "./resolve.js";
import { verifySheet, verifySheetPlan } from "./verify.js";

const settings: ResolvedSheetNestSettings = { ...DEFAULT_SHEET_NESTING, sheetWidthMm: 200, sheetHeightMm: 100, marginMm: 5, spacingMm: 2 };
const square = (id: string): NestPartV1 => ({
  id,
  label: id.toUpperCase(),
  rootLayerIndex: 0,
  members: [],
  outline: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: 0, y: 0 }],
  areaMm2: 400,
});
const parts = [square("a"), square("b")];
const byId = new Map(parts.map((part) => [part.id, part]));

describe("sheet plan verification", () => {
  it("accepts parts inside the margin and exactly the spacing apart", () => {
    expect(verifySheet(byId, [{ partId: "a", rotationDeg: 0, xMm: 5, yMm: 5 }, { partId: "b", rotationDeg: 0, xMm: 27, yMm: 5 }], settings)).toEqual([]);
  });

  it("flags parts closer than the spacing", () => {
    expect(verifySheet(byId, [{ partId: "a", rotationDeg: 0, xMm: 5, yMm: 5 }, { partId: "b", rotationDeg: 0, xMm: 26, yMm: 5 }], settings)).toEqual(["A and B are closer than the spacing."]);
  });

  it("flags parts past the margin, rotation included", () => {
    // Rotated a quarter turn about the origin the square spans x in [-20, 0].
    expect(verifySheet(byId, [{ partId: "a", rotationDeg: 90, xMm: 22, yMm: 5 }], settings)).toEqual(["A reaches past the sheet margin."]);
    expect(verifySheet(byId, [{ partId: "a", rotationDeg: 90, xMm: 25, yMm: 5 }], settings)).toEqual([]);
  });

  it("requires every part exactly once across the plan", () => {
    const plan = { settings, sheets: [{ placements: [{ partId: "a", rotationDeg: 0, xMm: 5, yMm: 5 }, { partId: "a", rotationDeg: 0, xMm: 60, yMm: 5 }, { partId: "ghost", rotationDeg: 0, xMm: 90, yMm: 5 }], usedWidthMm: 100, method: "rectangles" as const }] };
    expect(verifySheetPlan(parts, plan)).toEqual(["A is placed 2 times.", "B is not on any sheet.", "Sheet 1: Unknown part ghost."]);
  });
});
