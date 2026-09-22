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
}

export interface ChartDraft {
  lake: ChartableLake | undefined;
  image: ChartImage | undefined;
  /** Kept only to redraw the canvas; the engine reads `image`. */
  pixels: ImageData | undefined;
  imageName: string;
  fileSha256: string;
  depths: PlacedDepth[];
  units: ChartUnit;
  reads: "depth" | "elevation";
  surface: string;
  interval: string;
  title: string;
  attestation: ChartAttestation;
  result: ChartBuildResult | undefined;
}

const empty = (): ChartDraft => ({
  lake: undefined,
  image: undefined,
  pixels: undefined,
  imageName: "",
  fileSha256: "",
  depths: [],
  units: "ft",
  reads: "depth",
  surface: "0",
  interval: "5",
  title: "",
  attestation: "own-work",
  result: undefined,
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
