export * from "./types.js";
export { cellEdges, planSeamGrid, seamShift, splitLayersForWorkArea } from "./split.js";
export * from "./geometry.js";
export * from "./labels.js";
export * from "./markers.js";
export * from "./north-arrow.js";
export * from "./offset.js";
export * from "./svg.js";
export { PAINT_BLEED_MM, paintRegions } from "./paint-regions.js";
export type { FlatWaterArea, PaintLayerClip, PaintRegionSources } from "./paint-regions.js";
export * from "./units.js";
// Water carving is a stage of `generateGeometry`, not an entry point: its
// scratch-buffer helpers and ladder fitting are meaningless without the grid
// state it threads through them. Import those from "./water.js" directly.
// `carveWaterDepth` stays public because scripts/verify-lake-outlines.mjs
// carves a grid in the browser to compare provider outlines.
export { carveWaterDepth } from "./water.js";
export * from "./water-pattern.js";
export * from "./export-policy.js";
export * from "./source-requirements.js";
export { cropRadiusMm } from "./crop.js";
