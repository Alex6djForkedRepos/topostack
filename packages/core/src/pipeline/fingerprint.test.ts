import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, projectFingerprint, type ProjectConfigV1 } from "../index.js";

describe("project fingerprint", () => {
  it("hashes value-identical projects to the same fingerprint regardless of key order", () => {
    const reordered = Object.fromEntries(Object.entries(DEFAULT_PROJECT).reverse()) as unknown as ProjectConfigV1;
    expect(projectFingerprint(reordered)).toBe(projectFingerprint(DEFAULT_PROJECT));
    expect(projectFingerprint({ ...DEFAULT_PROJECT, widthMm: 301 })).not.toBe(projectFingerprint(DEFAULT_PROJECT));
    expect(projectFingerprint({ ...DEFAULT_PROJECT, explodedPreview: 0.9 })).toBe(projectFingerprint(DEFAULT_PROJECT));
    expect(projectFingerprint({ ...DEFAULT_PROJECT, name: "Renamed without geometry changes" })).toBe(projectFingerprint(DEFAULT_PROJECT));
  });
});
