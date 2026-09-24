export * from "./types.js";
export { cellEdges, planSeamGrid, seamShift, splitLayersForWorkArea } from "./pipeline/split.js";
export { generateGeometry, createGeometryGenerator, createParallelGeometryGenerator, type ParallelGenerationOptions, type GenerationOptions, type GenerationStage } from "./pipeline/generate.js";
export { validateProject } from "./pipeline/validate.js";
export { createSyntheticSource } from "./pipeline/synthetic-source.js";
export { projectFingerprint } from "./pipeline/fingerprint.js";
export { groundWidthMFor, horizontalScaleFor, planTerrainStack } from "./pipeline/stack-plan.js";
export { CONTOUR_SIMPLIFICATION_FACTOR } from "./pipeline/contours.js";
export { coordinateGridInterval } from "./pipeline/coordinate-grid.js";
// Polygon clip inputs appear in exported signatures (paint regions, marker
// placement), so the prepared form is public even though the primitives stay internal.
export type { PreparedPolygons } from "./primitives/geometry2d.js";
export * from "./annotate/labels.js";
export { FONT_CATALOG, FontNotLoadedError, clearRegisteredFonts, decodeFontGlyphs, fontEntry, isBitmapFont, isFontLoaded, isTextFont, missingGlyphs, projectFonts, registerFont, type FontCatalogEntry, type FontGlyphsV1, type FontKind } from "./annotate/font-data.js";
export * from "./annotate/markers.js";
export { MarkerIconError, buildMarkerIcon, iconShapePolygons, markerIconBottom, markerIconPointCount, markerIconPolygons, paintedRegion, type MarkerIconPaint } from "./annotate/marker-icons.js";
export { GRAPHIC_CLEARANCE_MM, graphicHalfExtents, placedGraphicCenter, placedGraphicFootprint, placedGraphicMarkingPrefix, placedGraphicMarkings, placedGraphicPlacementAt, placedGraphicPolygons, placedGraphicSource } from "./annotate/graphics.js";
export { absolutePathCommands, flattenSvgPath, type AbsolutePathCommand, type PathPolyline } from "./annotate/svg-path-data.js";
export * from "./annotate/north-arrow.js";
export * from "./annotate/plaque.js";
export * from "./annotate/scale-bar.js";
export * from "./primitives/offset.js";
export { layerToSvg, masterToSvg } from "./export/svg.js";
export { assemblyGuideToHtml, type GuideFont, type GuideSheet } from "./export/assembly-guide.js";
export { engravingToSvg } from "./export/engraving-svg.js";
export { buildEngravingPackage, buildFabricationPackage, buildProjectPackage, type PackageOptions } from "./export/packages.js";
export { PAINT_BLEED_MM, PAINT_LOOSE_SHEET_MIN_MM, PAINT_PAPER_MIN_MM, paintRegions, paintStencil } from "./pipeline/paint-regions.js";
export type { FlatWaterArea, PaintLayerClip, PaintRegionSources } from "./pipeline/paint-regions.js";
export * from "./primitives/units.js";
// Water carving is a stage of `generateGeometry`, not an entry point: its
// scratch-buffer helpers and ladder fitting are meaningless without the grid
// state it threads through them. Import those from "./water/water.js" directly.
// `carveWaterDepth` stays public because scripts/verify-lake-outlines.mjs
// carves a grid in the browser to compare provider outlines.
export { carveWaterDepth } from "./water/water.js";
export * from "./water/water-pattern.js";
export * from "./export/export-policy.js";
export * from "./pipeline/source-requirements.js";
export { cropRadiusMm } from "./primitives/crop.js";

export { executeGeometryTask, type GeometryTask, type GeometryBatch, type GeometryTaskResult } from "./pipeline/generation-tasks.js";
