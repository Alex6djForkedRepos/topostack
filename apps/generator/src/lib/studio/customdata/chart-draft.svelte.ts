import type { ChartAttestation, ChartUnit } from "@topostack/data-contracts/chart-bathymetry";
import type { ChartBuildResult, ChartImage } from "$lib/domain/chart-build";
import type { ChartableLake } from "$lib/domain/lake-lookup";

/**
 * The chart being traced right now, held outside any component.
 *
 * The custom data workspace is one of several views the maker switches
 * between, and switching a view unmounts it. A half-traced chart must survive
 * a look at the map and back, so the work in progress lives here instead of in
 * the component. It is deliberately not part of the project: nothing here is
 * saved or exported until the maker keeps the chart.
 */

export interface PlacedDepth {
  /** Image pixels, where the maker clicked the contour. */
  x: number;
  y: number;
  value: number;
  /** How far from a line the click may have landed, in image pixels: a fixed distance on screen. */
  reach: number;
}

export interface ChartDraft {
  lake: ChartableLake | undefined;
  image: ChartImage | undefined;
  /** Kept only to redraw the canvas; the engine reads `image`. */
  pixels: ImageData | undefined;
  imageName: string;
  fileSha256: string;
  /**
   * The uploaded file, kept for a PDF so another of its pages can be drawn,
   * with how many pages it has and which one is showing.
   */
  pdf: { file: File; pages: number; page: number } | undefined;
  depths: PlacedDepth[];
  units: ChartUnit;
  reads: "depth" | "elevation";
  surface: string;
  interval: string;
  title: string;
  attestation: ChartAttestation;
  /** Which of the chart's plausible placements on the lake to trace with; see ChartBuildRequest.placement. */
  placement: number;
  result: ChartBuildResult | undefined;
  /** What `result` was traced from, so a later change of inputs shows it is out of date. */
  resultKey: string;
}

const empty = (): ChartDraft => ({
  lake: undefined,
  image: undefined,
  pixels: undefined,
  imageName: "",
  fileSha256: "",
  pdf: undefined,
  depths: [],
  units: "ft",
  reads: "depth",
  surface: "",
  interval: "5",
  title: "",
  attestation: "own-work",
  placement: 0,
  result: undefined,
  resultKey: "",
});

export const draft = $state<ChartDraft>(empty());

/** Starts again, keeping nothing. */
export function resetDraft(): void {
  Object.assign(draft, empty());
}

/** Keeps the lake but drops the picture and everything traced from it. */
export function resetChartImage(): void {
  const { lake } = draft;
  Object.assign(draft, empty(), { lake });
}
