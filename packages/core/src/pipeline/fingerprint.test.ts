import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, projectFingerprint, type ProjectConfigV1 } from "../index.js";

describe("project fingerprint", () => {
  it("hashes value-identical projects to the same fingerprint regardless of key order", () => {
    const reordered = Object.fromEntries(Object.entries(DEFAULT_PROJECT).reverse()) as unknown as ProjectConfigV1;
    expect(projectFingerprint(reordered)).toBe(projectFingerprint(DEFAULT_PROJECT));
    expect(projectFingerprint({ ...DEFAULT_PROJECT, widthMm: 301 })).not.toBe(projectFingerprint(DEFAULT_PROJECT));
    expect(projectFingerprint({ ...DEFAULT_PROJECT, explodedPreview: 0.9 })).toBe(projectFingerprint(DEFAULT_PROJECT));
    expect(projectFingerprint({ ...DEFAULT_PROJECT, name: "Renamed without geometry changes" })).toBe(projectFingerprint(DEFAULT_PROJECT));
    // Sheet nesting only arranges finished parts at export time.
    const sheetNesting = { sheetWidthMm: 600, sheetHeightMm: 400, marginMm: 3, spacingMm: 2, rotation: "quarter" as const, timeBudgetS: 30, seed: 1 };
    expect(projectFingerprint({ ...DEFAULT_PROJECT, sheetNesting })).toBe(projectFingerprint(DEFAULT_PROJECT));
  });

  it("leaves projects without an optional field unchanged, and re-carves when one arrives", () => {
    // An absent optional key and an explicitly undefined one are the same
    // project, so adding one never invalidates saved work.
    expect(projectFingerprint({ ...DEFAULT_PROJECT, userDepthCharts: undefined })).toBe(projectFingerprint(DEFAULT_PROJECT));
    expect(projectFingerprint({ ...DEFAULT_PROJECT, plaque: undefined, scaleBarPlacement: undefined })).toBe(projectFingerprint(DEFAULT_PROJECT));
    // A depth chart changes the lake bed, so it must change the fingerprint.
    const charted = { ...DEFAULT_PROJECT, userDepthCharts: { "9092": { id: "round-lake-chart", contentHash: "a".repeat(64) } } };
    expect(projectFingerprint(charted)).not.toBe(projectFingerprint(DEFAULT_PROJECT));
    expect(projectFingerprint({ ...charted, userDepthCharts: { "9092": { id: "round-lake-chart", contentHash: "b".repeat(64) } } })).not.toBe(projectFingerprint(charted));
  });
});
