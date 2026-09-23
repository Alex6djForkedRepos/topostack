// A vector chart page to contours with levels, in page units and chart units.
// Which strokes are contours and which is the shoreline is the maker's choice
// (or a batch manifest's): colours differ between publishers, and the same
// colour can mean a road on one chart and a contour on the next.

import type { Point2 } from "./local-frame.ts";
import { inferLevels } from "./levels.ts";
import { bridgeGaps, chainPaths, depthLabels, labelChains, styleKey, type Chain } from "./vector-chart.ts";
import type { VectorPage } from "./vector-page.ts";
import { inferIntervalM } from "./grid.ts";

export interface VectorTraceOptions {
  /** Stroke style keys (from strokeStyles) that draw contours. */
  contourStyles: string[];
  /** Stroke style keys that draw the shoreline; omit when the chart has none. */
  shorelineStyles?: string[];
  /** Whether labels are depths below the surface or elevations above a datum. */
  labels: "depth" | "elevation";
  /** The surface in chart units for elevation labels, which the shoreline stands for. */
  surface?: number;
  /** Contour interval in chart units; inferred from the labels when absent. */
  interval?: number;
  /** The map's page rectangle. Labels and contour paths outside it (legends, insets, grid ticks) are ignored. */
  mapArea?: { left: number; top: number; right: number; bottom: number };
}

export interface TracedContour {
  points: Point2[];
  closed: boolean;
  /** Level in chart units. */
  value: number;
  inferred: boolean;
}

export interface VectorTrace {
  contours: TracedContour[];
  shoreline: Point2[][];
  interval: number;
  diagnostics: {
    paths: number;
    chains: number;
    labels: number;
    labelled: number;
    inferred: number;
    unresolved: number;
    /** Chains carrying labels that disagree with each other; they get no level. */
    labelDisagreements: number;
    /**
     * Spaces between lines that touch levels no single band can hold. Some
     * are normal on a real chart (lines crowding closer than the raster, gaps
     * at the map edge); many means a contour style is missing.
     */
    contradictoryRegions: number;
    /** Share of contour length that ended with a level. */
    coverage: number;
  };
}

function pathLength(points: readonly Point2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index]![0] - points[index - 1]![0], points[index]![1] - points[index - 1]![1]);
  return total;
}

export function traceVectorChart(page: VectorPage, options: VectorTraceOptions): VectorTrace {
  const contourStyles = new Set(options.contourStyles);
  const shorelineStyles = new Set(options.shorelineStyles ?? []);
  if (!contourStyles.size) throw new Error("Choose at least one contour style.");
  if (options.labels === "elevation" && options.surface === undefined) throw new Error("Elevation labels need the surface elevation.");
  const area = options.mapArea;
  const inMap = area ? (x: number, y: number) => x >= area.left && x <= area.right && y >= area.top && y <= area.bottom : undefined;
  // A path belongs to the map when most of it is inside; contours may run to the map frame.
  const onMap = (points: readonly Point2[]) => !inMap || points.filter(([x, y]) => inMap(x, y)).length * 2 >= points.length;
  const contourPaths = page.paths.filter((path) => path.stroke && contourStyles.has(styleKey(path)) && onMap(path.points));
  // Ends a hair apart are the same point; scale with the page, never below a quarter unit.
  const tolerance = Math.max(0.25, Math.hypot(page.width, page.height) * 1e-4);
  const labels = depthLabels(page.texts, inMap);
  const widths = labels.map((label) => label.width).sort((a, b) => a - b);
  const typicalLabel = widths.length ? widths[Math.floor(widths.length / 2)]! : 0;
  // A label gap is about one label wide; allow some margin either side.
  const chains = bridgeGaps(chainPaths(contourPaths, tolerance), Math.max(tolerance * 4, typicalLabel * 1.8));
  const labelled = labelChains(chains, labels);
  const interval = options.interval ?? inferIntervalM(labels.map((label) => label.value));
  if (!interval) throw new Error("Set the contour interval; the labels do not show it.");

  const shoreline = chainPaths(page.paths.filter((path) => path.stroke && shorelineStyles.has(styleKey(path)) && onMap(path.points)), tolerance)
    .filter((chain: Chain) => chain.points.length >= 3)
    .map((chain) => chain.points);
  const surface = options.labels === "depth" ? 0 : options.surface!;
  const levels = inferLevels({
    lines: labelled.map((chain) => ({ points: chain.points, closed: chain.closed, ...(chain.value === undefined ? {} : { value: chain.value }) })),
    ...(shoreline.length ? { shoreline: { rings: shoreline, value: surface } } : {}),
    interval,
    inward: options.labels === "depth" ? 1 : -1,
    width: page.width,
    height: page.height,
  });

  const contours: TracedContour[] = [];
  let total = 0;
  let covered = 0;
  labelled.forEach((chain, index) => {
    const length = pathLength(chain.points);
    total += length;
    const value = levels.values[index];
    if (value === undefined) return;
    covered += length;
    contours.push({ points: chain.points, closed: chain.closed, value, inferred: levels.inferred[index]! });
  });
  return {
    contours,
    shoreline,
    interval,
    diagnostics: {
      paths: contourPaths.length,
      chains: chains.length,
      labels: labels.length,
      labelled: labelled.filter((chain) => chain.value !== undefined).length,
      inferred: levels.inferred.filter(Boolean).length,
      unresolved: labelled.length - contours.length,
      labelDisagreements: labelled.filter((chain) => chain.labels.length && chain.value === undefined).length,
      contradictoryRegions: levels.regions.contradictory,
      coverage: total ? covered / total : 0,
    },
  };
}
