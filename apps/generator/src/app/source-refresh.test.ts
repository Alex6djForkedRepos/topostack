import { describe, expect, it } from "vitest";
import { createSyntheticSource, DEFAULT_PROJECT, type ProjectConfigV1, type SourceBundleV1 } from "@topostack/core";
import { markStaleSourceData } from "./source-refresh";

const loaded = (overrides: Partial<SourceBundleV1> = {}): SourceBundleV1 => ({ ...createSyntheticSource(DEFAULT_PROJECT, 8), sourceKind: "real", vectorStatus: "available", lakeDataStatus: "available", ...overrides });
const stale = (source: SourceBundleV1, patch: Partial<ProjectConfigV1>) => markStaleSourceData(source, patch, DEFAULT_PROJECT, { ...DEFAULT_PROJECT, ...patch });

describe("stale source data", () => {
  it("reloads vectors when a road, trail, or boundary layer is turned on", () => {
    for (const key of ["showRoads", "showTrails", "showBoundaries"] as const) {
      expect(stale(loaded(), { [key]: true }).vectorStatus).toBe("not-requested");
    }
  });

  it("keeps loaded vectors when a layer is turned off", () => {
    const source = loaded();
    for (const key of ["showRoads", "showTrails", "showBoundaries"] as const) {
      expect(stale(source, { [key]: false })).toBe(source);
    }
  });

  it("reloads a truncated load when a layer is turned off, since more features may now fit", () => {
    expect(stale(loaded({ vectorStatus: "partial" }), { showRoads: false }).vectorStatus).toBe("not-requested");
  });

  it("still reloads on water changes", () => {
    expect(stale(loaded(), { showWater: false }).vectorStatus).toBe("not-requested");
  });

  it("fetches water outlines when a paint stencil is the first thing to need them", () => {
    const dry: ProjectConfigV1 = { ...DEFAULT_PROJECT, showWater: false, showWaterDepth: false };
    const next = markStaleSourceData(loaded(), { paintTemplates: ["water"] }, dry, { ...dry, paintTemplates: ["water"] });
    expect(next.vectorStatus).toBe("not-requested");
    expect(next.lakeDataStatus).toBe("not-requested");
    // Outlines already loaded for drawing serve the stencil as they are.
    const source = loaded();
    expect(markStaleSourceData(source, { paintTemplates: ["water"] }, DEFAULT_PROJECT, { ...DEFAULT_PROJECT, paintTemplates: ["water"] })).toBe(source);
    expect(markStaleSourceData(source, { paintTemplates: [] }, { ...dry, paintTemplates: ["water"] }, dry)).toBe(source);
  });
});
