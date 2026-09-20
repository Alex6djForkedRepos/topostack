import { getContext, setContext } from "svelte";
import type { GeometryIRV1, LineStyleV1, OperationPath, ProjectConfigV1, SourceBundleV1, TerrainStackPlan } from "@topostack/core";
import type { elevationUnit, lengthUnit, planSeamGrid } from "@topostack/core";
import type { PlaceResult } from "$lib/domain/data-provider";
import type { studioFeedbackContext } from "$lib/site/feedback";
import type { ExportPhase } from "$lib/studio/export-notice";
import type { HistoryAvailability } from "$lib/studio/history";
import type { LazyComponent } from "$lib/studio/lazy-component";
import type { ENGRAVING_MODE_OPTIONS, STACK_MODE_OPTIONS } from "$lib/studio/options";
import type { ConfigSectionId, countDetailMarkings, modeledLakes, visibleWarnings } from "$lib/studio/preview-summary";

export type PreviewMode = "map" | "engraving" | "2d" | "3d";
export type GenerateState = "idle" | "loading" | "ready" | "error";
export type LineWidthKey = Exclude<keyof LineStyleV1, "trailPattern" | "roadStyle" | "roadCap">;

/**
 * Everything the studio panels read from, and write back to, App.svelte.
 *
 * App.svelte owns the state (project, geometry, generation lifecycle, dialog
 * flags) and the functions that mutate it. The panels under studio/panels/
 * get this object from context and read its properties inside `$derived`, so
 * they re-render when App's state changes without holding any state of their
 * own. Writable members are the flags a panel toggles directly (open dialogs,
 * preview mode, the selected layer); everything else changes through a method.
 */
export interface StudioContext {
  // Project and generated output
  readonly project: ProjectConfigV1;
  readonly sourceProject: ProjectConfigV1;
  readonly activeSource: SourceBundleV1;
  readonly geometry: GeometryIRV1;
  readonly outputMode: ProjectConfigV1["outputMode"];
  readonly stackPlan: TerrainStackPlan;
  readonly stackLayerCount: number;
  readonly contourInterval: number;
  readonly seamGrid: ReturnType<typeof planSeamGrid>;
  readonly seamSummary: string;
  readonly northArrowSizeLimitMm: number;
  readonly activeLinePreset: string | undefined;
  readonly detailCounts: ReturnType<typeof countDetailMarkings>;
  readonly modeledLakes: ReturnType<typeof modeledLakes>;
  readonly hasDepthOverride: boolean;
  readonly layerTicks: number[];
  readonly terrainDataStale: boolean;
  readonly verticalExaggerationStale: boolean;
  readonly terrainDataAction: "regenerate" | "generate";
  readonly lakeDepthFittingOn: boolean;
  readonly visibleWarnings: ReturnType<typeof visibleWarnings>;

  // Generation and export lifecycle
  readonly generationState: GenerateState;
  readonly generationStep: number;
  readonly status: string;
  readonly detailsUpdating: boolean;
  readonly previewBusy: boolean;
  readonly previewBusyLabel: string;
  readonly exportPhase: ExportPhase;
  readonly exportBlockedBy: string | undefined;
  readonly exportReady: boolean;
  readonly booted: boolean;
  readonly historyAvailability: HistoryAvailability;
  readonly embeddedInPlatform: boolean;

  // Preview
  mode: PreviewMode;
  threeUnavailable: boolean;
  previewNotice: string;
  selectedLayer: number;
  explodedDrag: number | undefined;
  readonly explodedPreview: number;
  readonly previewModeOptions: typeof STACK_MODE_OPTIONS | typeof ENGRAVING_MODE_OPTIONS;
  readonly MapCanvas: typeof import("$lib/studio/MapCanvas.svelte").default | undefined;
  readonly EngravingPreview: typeof import("$lib/studio/EngravingPreview.svelte").default | undefined;
  readonly TwoDPreview: typeof import("$lib/studio/TwoDPreview.svelte").default | undefined;
  readonly ThreePreview: typeof import("$lib/studio/ThreePreview.svelte").default | undefined;
  readonly engravingPreview: LazyComponent<typeof import("$lib/studio/EngravingPreview.svelte").default>;
  readonly twoDPreview: LazyComponent<typeof import("$lib/studio/TwoDPreview.svelte").default>;

  // Sidebar and dialogs
  readonly openSections: Record<ConfigSectionId, boolean>;
  searchOpen: boolean;
  resetOpen: boolean;
  mapAspectLocked: boolean;
  lineworkOpen: boolean;
  locationTrigger: HTMLButtonElement | undefined;

  // Display units
  readonly shownLengthUnit: ReturnType<typeof lengthUnit>;
  readonly shownElevationUnit: ReturnType<typeof elevationUnit>;
  shownLength(valueMm: number): number;
  shownDepth(valueM: number): number;
  shownLineWidth(valueMm: number): number;
  shownTextSize(valueMm: number): number;
  storedLength(value: number): number;
  workAreaLength(value: number): number;

  // Edits
  updateProject(patch: Partial<ProjectConfigV1>): void;
  updateFabrication(patch: Partial<ProjectConfigV1>, delayMs?: number): Promise<void>;
  updateMapDetails(patch: Partial<ProjectConfigV1>, delayMs?: number): Promise<void>;
  updateLocation(patch: Partial<ProjectConfigV1["location"]>): void;
  updateVerticalExaggeration(verticalExaggeration: number): void;
  updateDepthLayerLimit(value: number): void;
  setLakeDepth(hylakId: number, shown: number): Promise<void> | undefined;
  setLineWidth(key: LineWidthKey, shown: number): Promise<void> | undefined;
  applyCustomDataEdit(patch: Partial<ProjectConfigV1> | undefined): void;
  choosePlace(place: PlaceResult): void;
  undo(): void;
  redo(): void;
  importProject(file: File | undefined): Promise<void>;

  // Generation
  generate(): Promise<void>;
  cancelGeneration(): void;

  // Sidebar helpers
  toggleSection(section: ConfigSectionId): void;
  setAllSections(open: boolean): void;
  sectionSummary(section: ConfigSectionId): string;
  navigateChoice(event: KeyboardEvent & { currentTarget: HTMLButtonElement }): void;
  dismissPreviewWarning(event: MouseEvent, warningKey?: string): void;
  previewMarkingPath(marking: OperationPath): string;
  trailPatternDash(style: LineStyleV1): string | undefined;
  getFeedbackContext(): ReturnType<typeof studioFeedbackContext>;
}

const KEY = Symbol("topostack-studio");

export function provideStudio(studio: StudioContext): void {
  setContext(KEY, studio);
}

export function getStudio(): StudioContext {
  const studio = getContext<StudioContext | undefined>(KEY);
  if (!studio) throw new Error("Studio panels must be rendered inside App.svelte.");
  return studio;
}
