import { DEFAULT_PROJECT, FONT_CATALOG, markerSymbolPaths, northArrowMarkings, type CustomLineKind, type LineStyleV1, type MarkerSymbol, type NorthArrowStyle, type OperationPath, type Point2D, type RoadCap, type RoadStyle, type FontCatalogEntry, type FontKind, type TrailPattern, type WaterFillPattern } from "@topostack/core";
import type { PlaceResult } from "$lib/domain/data-provider";

/** Fixed choices for the studio controls. */
export const PRESETS: PlaceResult[] = [
  { id: "crater-lake", label: "Crater Lake, Oregon, USA", lat: 42.9446, lon: -122.109 },
  { id: "grand-teton", label: "Grand Teton and Jenny Lake, Wyoming, USA", lat: 43.76, lon: -110.73 },
  { id: "rainier", label: "Mount Rainier, Washington, USA", lat: 46.8523, lon: -121.7603 },
  { id: "grand-canyon", label: "Grand Canyon, Arizona, USA", lat: 36.1069, lon: -112.1129 },
];
export const UNIT_OPTIONS = [{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }];
export const SHAPE_OPTIONS = [{ value: "rectangle", label: "Rectangle" }, { value: "circle", label: "Circle" }];
export const STACK_MODE_OPTIONS = [{ value: "map", label: "Map" }, { value: "2d", label: "Cut layers" }, { value: "3d", label: "3D stack" }];
export const ENGRAVING_MODE_OPTIONS = [{ value: "map", label: "Map" }, { value: "engraving", label: "Engraving" }];
/** The engraving fonts, grouped by how a laser runs them. */
export const FONT_GROUPS: Array<{ kind: FontKind; label: string; hint: string; fonts: FontCatalogEntry[] }> = ([
  { kind: "bitmap", label: "Built-in", hint: "Compact capitals drawn as short strokes." },
  { kind: "single-line", label: "Single line", hint: "Real letterforms drawn as one pass of the laser: fast, crisp vector engraving." },
  { kind: "outline", label: "Filled", hint: "Typefaces engraved as filled areas. Set the engrave layer to fill or raster." },
] as const).map((group) => ({ ...group, fonts: FONT_CATALOG.filter((entry) => entry.kind === group.kind) }));
export const LINE_PRESETS: Array<{ value: string; label: string; description: string; style: LineStyleV1 }> = [
  { value: "fine", label: "Fine", description: "Dense detail", style: { contourMm: 0.1, indexContourMm: 0.22, majorRoadMm: 0.3, localRoadMm: 0.18, trailMm: 0.14, waterMm: 0.22, boundaryMm: 0.16, coordinateGridMm: 0.1, annotationMm: 0.14, borderMm: 0.26, trailPattern: "dotted", roadStyle: "centerline", majorRoadSpacingMm: 0.65, roadCap: "round" } },
  { value: "balanced", label: "Balanced", description: "Clear hierarchy", style: { ...DEFAULT_PROJECT.lineStyle } },
  { value: "bold", label: "Bold", description: "Strong contrast", style: { contourMm: 0.24, indexContourMm: 0.48, majorRoadMm: 0.56, localRoadMm: 0.36, trailMm: 0.3, waterMm: 0.44, boundaryMm: 0.34, coordinateGridMm: 0.24, annotationMm: 0.28, borderMm: 0.52, trailPattern: "dashed", roadStyle: "centerline", majorRoadSpacingMm: 1, roadCap: "round" } },
];
export const WATER_FILL_PATTERNS: Array<{ value: WaterFillPattern; label: string }> = [{ value: "none", label: "None" }, { value: "lines", label: "Lines" }, { value: "ripples", label: "Ripples" }, { value: "dots", label: "Dots" }];
export const TRAIL_PATTERNS: Array<{ value: TrailPattern; label: string }> = [{ value: "solid", label: "Solid" }, { value: "dashed", label: "Dashed" }, { value: "dotted", label: "Dotted" }];
export const ROAD_STYLES: Array<{ value: RoadStyle; label: string }> = [{ value: "centerline", label: "Centerline" }, { value: "outlined", label: "Outlined" }];
export const ROAD_CAPS: Array<{ value: RoadCap; label: string }> = [{ value: "round", label: "Round" }, { value: "square", label: "Square" }];
const NORTH_ARROW_CHOICES: Array<{ value: NorthArrowStyle; label: string }> = [
  { value: "minimal", label: "Minimal" }, { value: "classic", label: "Classic" }, { value: "mariner", label: "Mariner" },
];
export const NORTH_ARROW_OPTIONS: Array<{ value: NorthArrowStyle; label: string; markings: OperationPath[] }> = NORTH_ARROW_CHOICES.map((option) => ({ ...option, markings: northArrowMarkings({ ...DEFAULT_PROJECT, northArrowStyle: option.value, northArrowSizeMm: 100, northArrowPlacement: { anchor: "center", offset: { x: 0, y: 0 } } }) }));
export const MARKER_OPTIONS: Array<{ value: MarkerSymbol; label: string; paths: Point2D[][] }> = [
  { value: "pin", label: "Pin", paths: markerSymbolPaths("pin", { x: 0, y: 0 }, 20) },
  { value: "circle", label: "Circle", paths: markerSymbolPaths("circle", { x: 0, y: 0 }, 20) },
  { value: "triangle", label: "Triangle", paths: markerSymbolPaths("triangle", { x: 0, y: 0 }, 20) },
  { value: "star", label: "Star", paths: markerSymbolPaths("star", { x: 0, y: 0 }, 20) },
  { value: "cross", label: "Cross", paths: markerSymbolPaths("cross", { x: 0, y: 0 }, 20) },
];
export const CUSTOM_LINE_OPTIONS: Array<{ value: CustomLineKind; label: string }> = [
  { value: "trail", label: "Trail" },
  { value: "boundary", label: "Boundary" },
];
