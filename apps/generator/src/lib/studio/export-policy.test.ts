import { describe, expect, it } from "vitest";
import { createSyntheticSource, DEFAULT_PROJECT, generateGeometry, type SourceBundleV1 } from "@topostack/core";
import { createAtommExport, exportBlockReason } from "$lib/studio/export-policy";

function geometry(kind: SourceBundleV1["sourceKind"] = "real") {
  return generateGeometry(DEFAULT_PROJECT, { ...createSyntheticSource(DEFAULT_PROJECT, 32), sourceKind: kind });
}

describe("Atomm export policy", () => {
  it("blocks synthetic and stale results", () => {
    expect(exportBlockReason(geometry("synthetic"), DEFAULT_PROJECT)).toMatch(/real terrain/i);
    expect(exportBlockReason(geometry("preview"), DEFAULT_PROJECT)).toMatch(/real terrain/i);
    expect(exportBlockReason(geometry(), { ...DEFAULT_PROJECT, verticalExaggeration: 9 })).toMatch(/settings changed/i);
    // Older terrain, compass and single-layer marker geometry need regeneration.
    for (const version of ["v6", "v7", "v8"]) {
      const stale = geometry();
      stale.configFingerprint = stale.configFingerprint!.replace(/^v\d+-/, `${version}-`);
      expect(exportBlockReason(stale, DEFAULT_PROJECT)).toMatch(/settings changed/i);
    }
  });

  it("blocks incomplete requested vector data", () => {
    const result = geometry();
    result.vectorStatus = "unavailable";
    expect(exportBlockReason(result, DEFAULT_PROJECT)).toMatch(/map detail data is unavailable/i);
    result.vectorStatus = "partial";
    expect(exportBlockReason(result, DEFAULT_PROJECT)).toMatch(/safe feature limit/i);
    result.vectorStatus = "available";
    result.lakeDataStatus = "unavailable";
    expect(exportBlockReason(result, DEFAULT_PROJECT)).toMatch(/lake depth data is unavailable/i);
    const depthOnly = { ...DEFAULT_PROJECT, showRoads: false, showTrails: false, showWater: false };
    const missingOceanMask = generateGeometry(depthOnly, { ...createSyntheticSource(depthOnly, 32), sourceKind: "real", vectorStatus: "not-requested" });
    expect(exportBlockReason(missingOceanMask, depthOnly)).toMatch(/map detail data is unavailable/i);
    const withoutVectorDetails = { ...depthOnly, showWaterDepth: false };
    const completeWithoutVectors = generateGeometry(withoutVectorDetails, { ...createSyntheticSource(withoutVectorDetails, 32), sourceKind: "real", vectorStatus: "not-requested" });
    expect(exportBlockReason(completeWithoutVectors, withoutVectorDetails)).toBeUndefined();
  });

  it("returns one master for Studio and all files for download", () => {
    const result = geometry();
    const studio = createAtommExport(result, DEFAULT_PROJECT, "openInStudio");
    const download = createAtommExport(result, DEFAULT_PROJECT, "download");
    expect(Array.isArray(studio)).toBe(false);
    expect("filename" in studio && studio.filename.endsWith("-master.svg")).toBe(true);
    expect(Array.isArray(download)).toBe(true);
    expect(Array.isArray(download) && download.length).toBe((result.layers.length - result.fabricationNests.length) * 2 + 5);
  });

  it("returns the engrave-only artwork for a flat project", () => {
    const project = { ...DEFAULT_PROJECT, outputMode: "engraving" as const, engravingContourCount: 10 };
    const result = generateGeometry(project, { ...createSyntheticSource(project, 32), sourceKind: "real" });
    const studio = createAtommExport(result, project, "openInStudio");
    const download = createAtommExport(result, project, "download");
    expect("filename" in studio && studio.filename.endsWith("-engraving.svg")).toBe(true);
    expect(Array.isArray(download) && download).toHaveLength(4);
  });
  it("uses Atomm processing colors and physical dimensions for layered and flat artwork", async () => {
    for (const outputMode of ["stack", "engraving"] as const) {
      const project = { ...DEFAULT_PROJECT, outputMode, name: "Map / expedition\\draft" };
      const result = generateGeometry(project, { ...createSyntheticSource(project, 32), sourceKind: "real" });
      const output = createAtommExport(result, project, "openInStudio");
      if (Array.isArray(output)) throw new Error("Studio must receive one editable SVG");
      const svg = await output.blob.text();
      expect(output.filename).toMatch(/^[a-z0-9-]+\.svg$/);
      expect(output.blob.type).toBe("image/svg+xml");
      expect(svg).toMatch(/width="[\d.]+mm" height="[\d.]+mm" viewBox=/);
      expect(svg).toContain('stroke="#2366FF"');
      expect(svg.includes('stroke="#FE0002"')).toBe(outputMode === "stack");
      expect(svg).not.toMatch(/<use\b|#ff0035|#111827|#2563eb/);
      const shapes = svg.match(/<(?:path|rect|circle)\b[^>]*>/g) ?? [];
      expect(shapes.length).toBeGreaterThan(0);
      // Default artwork is all linework, even when a guide/contour is closed.
      // Its no-fill and processing color must survive removal of parent styles.
      for (const shape of shapes) {
        expect(shape).toContain('fill="none"');
        expect(shape).toMatch(/stroke="#(?:2366FF|FE0002)"/);
      }
      expect(shapes.some(shape => /alignment-|contour-/.test(shape))).toBe(true);
      const files = createAtommExport(result, project, "download");
      if (!Array.isArray(files)) throw new Error("Download must receive the project files");
      for (const file of files) {
        expect(file.filename).not.toMatch(/[\\/]/);
        expect(file.filename).toMatch(/\.[a-z]+$/);
      }
      expect(files.reduce((sum, file) => sum + file.blob.size, 0)).toBeLessThanOrEqual(100_000_000);
    }
  });

});
