<script lang="ts">
  import { onMount, untrack, setContext } from "svelte";
  import { base } from "$app/paths";
  import { House } from "@lucide/svelte";
  import { Box, ChevronDown, Circle, Compass, Download, Grid3X3, Layers3, Map as MapIcon, MapPin, Minus, Mountain, PenTool, Plus, Route, Search, Sparkles, Square, Trash2, Undo2, Redo2, Upload, Waves, X } from "@lucide/svelte";
  import { AppShell, Brand, Button, ContextBar, Field, IconButton, Input, Section, Sidebar, ThemeToggle, Topbar, Workspace } from "@loidolt/theme-svelte";
  import { sourceRequirements, createSyntheticSource, DEFAULT_PROJECT, displayElevation, displayLength, elevationUnit, generateGeometry, labelPathData, lengthUnit, MAX_PROJECT_DIMENSION_MM, MAX_PROJECT_NAME_LENGTH, MAX_VERTICAL_EXAGGERATION, MAX_WATER_DEPTH_EXAGGERATION, millimetersFromDisplay, MIN_VERTICAL_EXAGGERATION, MIN_WATER_DEPTH_EXAGGERATION, NORTH_ARROW_MIN_SIZE_MM, planTerrainStack, validateProject, type GeoBounds, type GeometryIRV1, type LineStyleV1, type OperationPath, type ProjectConfigV1, type SourceBundleV1 } from "@topostack/core";
  import { assembleWater, boundsForProject, loadLakeAreas, loadSurveyedLakeDepths, loadTerrain, loadVectorMarkings, type PlaceResult } from "../data-provider";
  import { applySurveyProvenance } from "../bathymetry";
  import { resolveLakeOutlines } from "../lake-outlines";
  import { theme } from "../lib/theme";
  import { trackUsage } from "../lib/usage";
  import { MAP_DATA_ATTRIBUTION } from "../map-attribution";
  import { createSamplePreviewSource } from "../sample-preview";
  import { exportBlockReason } from "../export-policy";
  import { loadProject, parseProject, saveProject } from "../storage";
  import { connectAtomm } from "./atomm-bridge";
  import type { DownloadOption } from "./native-export";
  import { downloadProject as downloadWithNotice, ExportNotice } from "./export-notice";
  import FeedbackButton from "../lib/FeedbackButton.svelte";
  import { studioFeedbackContext } from "../lib/feedback";
  import ExportDialog from "./ExportDialog.svelte";
  import { readAtommLocale } from "./atomm-locale";
  import NumberField from "./StudioNumberField.svelte";
  import { ProjectHistory } from "./history";
  import { CUSTOM_LINE_OPTIONS, ENGRAVING_MODE_OPTIONS, FONT_OPTIONS, LINE_PRESETS, MARKER_OPTIONS, NORTH_ARROW_ANCHOR_OPTIONS, NORTH_ARROW_OPTIONS, PRESETS, ROAD_CAPS, ROAD_STYLES, SHAPE_OPTIONS, STACK_MODE_OPTIONS, TRAIL_PATTERNS, UNIT_OPTIONS, WATER_FILL_PATTERNS } from "./options";
  import * as edits from "./project-edits";
  import { MAX_LATITUDE, MAX_LONGITUDE } from "../coordinates";
  import { isAbortError, PreviewPipeline } from "./preview-pipeline";
  import { LazyComponent } from "./lazy-component";
  import { restoreStartupProject } from "./startup-restore";
  import { activeLinePreset as findActiveLinePreset, CONFIG_SECTION_IDS, countDetailMarkings, featuredLayerIndex, layerForEnabledDetail, modeledLakes as findModeledLakes, sectionSummary as summarizeSection, visibleWarnings as summarizeWarnings, type ConfigSectionId } from "./preview-summary";
  import { retryingLoader } from "./lazy-load";
  import { sameMapArea } from "./project-diff";
  import { changedProjectKeys, projectPatch } from "./project-patch";
  import type { SourcePreparationCache } from "./source-refresh";
  import { generationStatus, generationToast, previewPendingStatus, previewStaleAreaStatus, previewUpdatedStatus, statusLine, type PreviewUpdateKind } from "./status-messages";
  import Switch from "./StudioSwitch.svelte";

  let { initialPreview }: { initialPreview?: GeometryIRV1 } = $props();

  type PreviewMode = "map" | "engraving" | "2d" | "3d";
  type GenerateState = "idle" | "loading" | "ready" | "error";
  const MENU_STATE_KEY = "topostack-menu-sections-v1";
  const MAX_PROJECT_FILE_BYTES = 2_000_000;
  const OSM_ATTRIBUTION = MAP_DATA_ATTRIBUTION.find((entry) => entry.name === "OpenStreetMap contributors") ?? { name: "OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" };
  function previewFor(config: ProjectConfigV1, source: SourceBundleV1): GeometryIRV1 {
    const result = generateGeometry(config, source);
    addPreviewWarning(result, source);
    return result;
  }

  function addPreviewWarning(result: GeometryIRV1, source: SourceBundleV1): void {
    if (source.sourceKind === "real" || result.warnings.some((warning) => warning.code === "DATA_FALLBACK")) return;
    result.warnings.push({ code: "DATA_FALLBACK", message: source.sourceKind === "preview" ? "Bundled real-data preview. Generate fresh terrain before exporting." : "Sample preview only. Generate real terrain before exporting." });
  }

  const defaultPreviewSource = createSamplePreviewSource();
  const defaultPreviewGeometry = untrack(() => initialPreview) ?? previewFor(DEFAULT_PROJECT, defaultPreviewSource);
  addPreviewWarning(defaultPreviewGeometry, defaultPreviewSource);
  let project = $state.raw<ProjectConfigV1>(DEFAULT_PROJECT);
  let activeSource = $state.raw<SourceBundleV1>(defaultPreviewSource);
  let sourceProject = $state.raw<ProjectConfigV1>(DEFAULT_PROJECT);
  let geometry = $state.raw<GeometryIRV1>(defaultPreviewGeometry);
  let mode = $state<PreviewMode>("3d");
  let threeUnavailable = $state(false);
  let previewNotice = $state("");
  let dismissedWarnings = $state<string[]>([]);
  let generationState = $state<GenerateState>("ready");
  let status = $state("Real-data sample preview ready");
  let detailsUpdating = $state(false);
  let selectedLayer = $state(featuredLayerIndex(defaultPreviewGeometry));
  // Live exploded-slider position. Committing every tick into `project`
  // replaced the whole config at 60 Hz, which re-ran the export fingerprint,
  // the stack plan, the map-area comparison and every sidebar summary; the
  // drag now only moves the preview and records one history entry on release.
  let explodedDrag = $state.raw<number | undefined>(undefined);
  let searchOpen = $state(false);
  let locationTrigger: HTMLButtonElement;
  let lineworkOpen = $state(false);
  let menuStateReady = $state(false);
  let openSections = $state<Record<ConfigSectionId, boolean>>({
    setup: true,
    size: false,
    terrain: false,
    details: false,
    customData: false,
    linework: false,
    advanced: false,
  });
  let AtommWorkbench = $state.raw<typeof import("./AtommWorkbench.svelte").default>();
  let atommLayoutFailed = $state(false);
  let atommReady = $state(false);
  let embeddedInPlatform = $state(false);
  setContext("atomm-embedded", () => embeddedInPlatform);
  let exportOpen = $state(false);
  const exportNotice = new ExportNotice((message) => { status = message; });
  const exportPhase = $derived(exportNotice.phase);
  const exportTitle = $derived(exportNotice.title);
  const exportDetail = $derived(exportNotice.detail);
  let themeColor = $state("");
  let booted = $state(false);
  let historyAvailability = $state({ canUndo: false, canRedo: false });
  const projectHistory = new ProjectHistory((availability) => { historyAvailability = availability; });
  let importInput: HTMLInputElement;
  // Worker lifecycle, edit revisions, and debounced refreshes. Every edit that
  // affects generation invalidates it, so stale work can never commit.
  const pipeline = new PreviewPipeline();
  // Map-data refresh code loads with the first preview edit, not at startup. A
  // failed load is forgotten, so the next edit retries it.
  const loadSourcePreparation = retryingLoader(async () => new (await import("./source-refresh")).SourcePreparationCache({ loadVectorMarkings, loadLakeAreas, loadSurveyedLakeDepths, applySurveyProvenance, resolveLakeOutlines, assembleWater }), "Map data refresh");
  let sourcePreparation: Promise<SourcePreparationCache> | undefined;
  const preparedSources = () => sourcePreparation = loadSourcePreparation();
  // Continuous controls (sliders, typed numbers) fire on every input tick. The
  // project value updates immediately; the preview refresh trails the last tick.
  const PREVIEW_REFRESH_DELAY_MS = 120;
  let generationAbort: AbortController | undefined;
  // Preview and modal components load on first use, keeping inactive workflows out of the initial bundle.
  const locationDialog = new LazyComponent(() => import("./LocationDialog.svelte"), (error) => {
    console.error("TopoStack could not load place search.", error); searchOpen = false; status = "Place search could not load · reload to update TopoStack";
  });
  const mapCanvas = new LazyComponent(() => import("./MapCanvas.svelte"), (error) => {
    console.error("TopoStack could not load the map preview.", error);
    if (mode === "map") { mode = project.outputMode === "engraving" ? "engraving" : "2d"; previewNotice = "Map preview could not load · reload to update TopoStack"; }
  });
  const engravingPreview = new LazyComponent(() => import("./EngravingPreview.svelte"), (error) => {
    console.error("TopoStack could not load the engraving preview.", error); status = "Engraving preview could not load · retry or reload to update TopoStack";
  });
  const twoDPreview = new LazyComponent(() => import("./TwoDPreview.svelte"), (error) => {
    console.error("TopoStack could not load the cut preview.", error); status = "Cut preview could not load · retry or reload to update TopoStack";
  });
  const threePreview = new LazyComponent(() => import("./ThreePreview.svelte"), (error) => {
    console.error("TopoStack could not load the 3D preview.", error);
    if (mode === "3d") { threeUnavailable = true; mode = "2d"; previewNotice = "3D preview could not load · reload to update TopoStack"; }
  });
  const LocationDialog = $derived(locationDialog.component);
  const MapCanvas = $derived(mapCanvas.component);
  const EngravingPreview = $derived(engravingPreview.component);
  const TwoDPreview = $derived(twoDPreview.component);
  const ThreePreview = $derived(threePreview.component);

  $effect(() => {
    const outputMode = project.outputMode;
    if (outputMode === "engraving" && mode !== "map" && mode !== "engraving") mode = "engraving";
    else if (outputMode === "stack" && mode === "engraving") mode = threeUnavailable ? "2d" : "3d";
  });

  $effect(() => {
    void theme.resolved;
    themeColor = getComputedStyle(document.documentElement).getPropertyValue("--loidolt-background").trim();
  });

  // Opening place search, the map, or 3D again retries a failed load: their
  // failure handlers already moved away. The engraving and cut previews have
  // no fallback view, so they wait for the Retry button instead of looping.
  $effect(() => {
    if (searchOpen) locationDialog.load();
    if (mode === "map") mapCanvas.load();
    else if (mode === "engraving") engravingPreview.ensure();
    else if (mode === "2d") twoDPreview.ensure();
    else if (mode === "3d") threePreview.load();
  });

  const explodedPreview = $derived(explodedDrag ?? project.explodedPreview);
  const totalHeight = $derived(geometry.layers.length * project.materialThicknessMm);
  // Layer count follows from map scale, relief, and material thickness, so the
  // panel previews the stack the current settings will actually produce.
  const stackPlan = $derived(planTerrainStack(project, geometry.landReliefM, geometry.bounds, geometry.waterDepthBelowLandM));
  const previewModeOptions = $derived(project.outputMode === "engraving" ? ENGRAVING_MODE_OPTIONS : STACK_MODE_OPTIONS);
  const previewBusy = $derived(generationState === "loading" || detailsUpdating);
  const previewBusyLabel = $derived(generationState === "loading" ? "Building your terrain" : "Refreshing preview");
  const contourInterval = $derived(geometry.landReliefM / (project.engravingContourCount + 1));
  const fabricationPanelCount = $derived(geometry.layers.length - geometry.fabricationNests.length);
  const getFeedbackContext = () => studioFeedbackContext(project, activeSource, geometry, !sameMapArea(sourceProject, project));
  const terrainDataStale = $derived(!sameMapArea(sourceProject, project));
  const verticalExaggerationStale = $derived(project.outputMode === "stack" && sourceProject.verticalExaggeration !== project.verticalExaggeration);
  const terrainDataAction = $derived(geometry.sourceKind === "real" ? "regenerate" : "generate");
  const exportBlockedBy = $derived(exportBlockReason(geometry, project));
  const exportReady = $derived(!exportBlockedBy);
  const platformExportAvailable = $derived(atommReady && embeddedInPlatform);
  const lakeDepthFittingOn = $derived(project.outputMode === "stack" && project.showWaterDepth && project.fitLakeDepth
    && geometry.waterSurfaces.some((surface) => surface.kind === "lake" && surface.depthFitScale !== undefined && surface.depthFitScale < 1));
  const visibleWarnings = $derived(summarizeWarnings(geometry.warnings, dismissedWarnings));

  function dismissPreviewWarning(event: MouseEvent, warningKey?: string): void {
    const button = event.currentTarget as HTMLButtonElement;
    // Keep keyboard focus in the preview after removing the focused control.
    const next = [...(button.closest(".warning-stack")?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      .find((candidate) => candidate !== button);
    (next ?? document.querySelector<HTMLButtonElement>('.mode-switch [aria-checked="true"]'))?.focus({ preventScroll: true });
    if (warningKey) dismissedWarnings = [...dismissedWarnings, warningKey];
    else previewNotice = "";
  }

  const layerTicks = $derived(geometry.layers.map((layer) => Math.round(displayElevation(layer.elevationM, project.units))));
  const shownLengthUnit = $derived(lengthUnit(project.units));
  const shownElevationUnit = $derived(elevationUnit(project.units));
  const northArrowSizeLimitMm = $derived(edits.northArrowMaximumMm(project.widthMm, project.heightMm));
  const activeLinePreset = $derived(findActiveLinePreset(project.lineStyle));
  // Renames and slider ticks replace `project` and `geometry` without touching
  // these, so the counts are only recomputed when the layers or mode change.
  const geometryLayers = $derived(geometry.layers);
  const outputMode = $derived(project.outputMode);
  const detailCounts = $derived(countDetailMarkings(geometryLayers, outputMode));
  const modeledLakes = $derived(findModeledLakes(geometry.waterSurfaces));
  const hasDepthOverride = $derived(Object.keys(project.waterDepthOverrides).length > 0);

  function shownDepth(valueM: number): number {
    return Math.round(displayElevation(valueM, project.units));
  }

  function setLakeDepth(hylakId: number, shown: number): Promise<void> | undefined {
    if (!Number.isFinite(shown) || shown <= 0) return undefined;
    const depthM = project.units === "imperial" ? shown / 3.280839895 : shown;
    return updateFabrication({ waterDepthOverrides: { ...project.waterDepthOverrides, [String(hylakId)]: depthM } });
  }

  function shownLength(valueMm: number): number {
    return Number(displayLength(valueMm, project.units).toFixed(3));
  }

  function storedLength(value: number): number {
    return millimetersFromDisplay(value, project.units);
  }

  function shownTextSize(valueMm: number): number {
    return Number(displayLength(valueMm, project.units).toFixed(project.units === "imperial" ? 4 : 1));
  }

  function shownLineWidth(valueMm: number): number {
    return Number(displayLength(valueMm, project.units).toFixed(project.units === "imperial" ? 4 : 2));
  }

  type LineWidthKey = Exclude<keyof LineStyleV1, "trailPattern" | "roadStyle" | "roadCap">;
  function setLineWidth(key: LineWidthKey, shown: number): Promise<void> | undefined {
    if (!Number.isFinite(shown)) return undefined;
    return updateFabrication({ lineStyle: { ...project.lineStyle, [key]: storedLength(shown) } });
  }

  /** Apply a marker or path edit from `project-edits`; `undefined` means the edit was rejected. */
  function applyCustomDataEdit(patch: Partial<ProjectConfigV1> | undefined): void {
    if (patch) void updateFabrication(patch);
  }

  function trailPatternDash(style: LineStyleV1): string | undefined {
    if (style.trailPattern === "solid") return undefined;
    return style.trailPattern === "dotted" ? "0.1 3.2" : "6 4";
  }

  function previewMarkingPath(marking: OperationPath): string {
    if (marking.label && marking.points[0]) return labelPathData(marking.label, marking.points[0], 0, 0, 0, marking.textStyle);
    return marking.points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  }

  function navigateChoice(event: KeyboardEvent & { currentTarget: HTMLButtonElement }): void {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const choices = [...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('button[role="radio"]') ?? [])];
    const current = choices.indexOf(event.currentTarget);
    if (current < 0 || !choices.length) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? choices.length - 1 : (current + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + choices.length) % choices.length;
    choices[next]?.focus();
    choices[next]?.click();
  }

  function toggleSection(section: ConfigSectionId): void {
    openSections = { ...openSections, [section]: !openSections[section] };
  }

  function setAllSections(open: boolean): void {
    openSections = Object.fromEntries(CONFIG_SECTION_IDS.map((section) => [section, open])) as Record<ConfigSectionId, boolean>;
  }

  function sectionSummary(section: ConfigSectionId): string {
    return summarizeSection(section, project, stackPlan.layerCount);
  }

  onMount(() => {
    let cancelled = false;
    try {
      const savedMenuState: unknown = JSON.parse(localStorage.getItem(MENU_STATE_KEY) ?? "null");
      if (savedMenuState && typeof savedMenuState === "object") {
        openSections = Object.fromEntries(CONFIG_SECTION_IDS.map((section) => [section, typeof (savedMenuState as Record<string, unknown>)[section] === "boolean" ? (savedMenuState as Record<string, boolean>)[section] : openSections[section]])) as Record<ConfigSectionId, boolean>;
      }
    } catch {
      // A malformed preference should never prevent the editor from loading.
    }
    menuStateReady = true;
    embeddedInPlatform = window.parent !== window;
    if (embeddedInPlatform) void import("./AtommWorkbench.svelte").then((module) => { if (!cancelled) AtommWorkbench = module.default; }).catch(() => { if (!cancelled) atommLayoutFailed = true; });
    const disconnectAtomm = connectAtomm(() => ({ geometry, project }), () => {
      atommReady = true;
      if (embeddedInPlatform && window.atomm) void readAtommLocale(window.atomm).then((locale) => { if (!cancelled) document.documentElement.lang = locale; });
    }, (update) => {
      exportNotice.apply(update);
      if (update.phase === "ready") trackUsage("export_prepared", project.outputMode, "atomm");
      if (update.phase === "error") trackUsage("export_failed", project.outputMode, "atomm");
    });
    void restoreStartupProject({
      loadProject,
      search: window.location.search,
      loadLakeLocation: () => import("../lib/lake-location"),
      consumeLakeLink: async () => {
        const { replaceState } = await import("$app/navigation");
        const url = new URL(window.location.href);
        url.searchParams.delete("lake"); url.searchParams.delete("bounds");
        replaceState(url, {});
      },
      isCancelled: () => cancelled,
      currentProject: () => project,
      restoreSaved: (saved) => {
        // A Generate or edit started before the restore finished belongs to
        // the default project; it must neither overwrite nor be undone into it.
        invalidatePendingPreview();
        projectHistory.reset();
        replaceSourceProject(saved, createSyntheticSource(saved));
      },
      openLinkedLake: (next, previous) => {
        invalidatePendingPreview();
        projectHistory.push(previous);
        replaceSourceProject(next, createSyntheticSource(next));
      },
      setStatus: (message) => { status = message; },
    }).then(({ autosave }) => {
      // Autosave must start even when restoring failed, or later edits are lost,
      // unless it would overwrite a saved project that could not be backed up.
      if (!cancelled && autosave) booted = true;
    });
    return () => { cancelled = true; disconnectAtomm(); exportNotice.dispose(); generationAbort?.abort(); pipeline.dispose(); };
  });

  $effect(() => {
    const current = openSections;
    if (!menuStateReady) return;
    try { localStorage.setItem(MENU_STATE_KEY, JSON.stringify(current)); } catch { /* Preferences are optional. */ }
  });

  $effect(() => {
    const current = project;
    if (!booted) return;
    const timeout = window.setTimeout(() => {
      // Never persist a project that would fail validation on the next load —
      // parse failures there would silently reset the user to the default project.
      try { validateProject(current); } catch { return; }
      if (!Number.isFinite(current.explodedPreview) || current.explodedPreview < 0 || current.explodedPreview > 1) return;
      void saveProject(current).catch(() => status = "Local save is unavailable in this browser");
    }, 450);
    return () => window.clearTimeout(timeout);
  });

  const COSMETIC_KEYS: ReadonlySet<string> = new Set(["name", "explodedPreview"]);
  // Stroke and text styling never changes the terrain request, so a running
  // Generate keeps going and re-renders with the latest style when it finishes.
  const GENERATION_STYLE_KEYS: ReadonlySet<string> = new Set(["lineStyle", "textStyle"]);

  /** Whether an edit to `keys` can leave in-flight generation and preview work running. */
  function keepsPendingWork(keys: readonly string[]): boolean {
    const generating = generationState === "loading";
    return keys.every((key) => COSMETIC_KEYS.has(key) || (generating && GENERATION_STYLE_KEYS.has(key)));
  }

  /** Swap in a project with its own source and preview, as import, restore, and directory links do. */
  function replaceSourceProject(next: ProjectConfigV1, source: SourceBundleV1): void {
    project = next; sourceProject = next; activeSource = source; geometry = previewFor(next, source);
    selectedLayer = featuredLayerIndex(geometry);
  }

  function updateProject(patch: Partial<ProjectConfigV1>): void {
    // Cosmetic edits (rename, exploded-preview slider) and styling must not
    // abort an in-flight generation.
    if (!keepsPendingWork(Object.keys(patch))) invalidatePendingPreview();
    projectHistory.record(project, Object.keys(patch));
    const nextProject = { ...project, ...patch };
    project = nextProject;
    if (typeof patch.name === "string") geometry = { ...geometry, projectName: nextProject.name };
  }
  function updateVerticalExaggeration(verticalExaggeration: number): void {
    if (!Number.isFinite(verticalExaggeration) || verticalExaggeration === project.verticalExaggeration) return;
    updateProject({ verticalExaggeration });
    status = "Vertical exaggeration changed · regenerate terrain";
  }

  function updateLocation(patch: Partial<ProjectConfigV1["location"]>): void {
    invalidatePendingPreview();
    projectHistory.record(project, ["location"]);
    project = { ...project, location: { ...project.location, ...patch, ...(("lat" in patch || "lon" in patch || "zoom" in patch) && !("bounds" in patch) ? { bounds: undefined } : {}) } };
    status = "Map area changed · regenerate terrain data";
  }
  function closeLocationDialog(): void {
    searchOpen = false;
    window.requestAnimationFrame(() => locationTrigger?.focus());
  }

  function choosePlace(place: PlaceResult): void {
    invalidatePendingPreview();
    projectHistory.push(project);
    project = { ...project, name: (place.surveyedLake ? place.label : place.label.split(",")[0] ?? "Terrain project").slice(0, MAX_PROJECT_NAME_LENGTH),
      ...(place.surveyedLake ? { outputMode: "stack" as const, showWaterDepth: true } : {}),
      location: { ...project.location, lat: place.lat, lon: place.lon, label: place.label, zoom: place.zoom ?? 11, bounds: place.bounds } };
    status = "Map area changed · regenerate terrain data";
    searchOpen = false;
  }

  /**
   * Undo and redo restore a whole project, so they take the same refresh path
   * as the edit they reverse: a map-area change asks for regeneration, a
   * cosmetic change patches the preview in place, and anything else rebuilds
   * the preview from the retained source.
   */
  function restoreProject(target: ProjectConfigV1, action: "Undo" | "Redo"): void {
    const changed = changedProjectKeys(project, target);
    const sourceChanged = changedProjectKeys(projectForPreview(target, sourceProject), sourceProject);
    // Like the edits themselves, undoing a rename or restyle keeps Generate running.
    const keepsWork = keepsPendingWork(changed);
    if (!keepsWork) invalidatePendingPreview();
    project = target;
    if (changed.includes("name")) geometry = { ...geometry, projectName: target.name };
    // Still loading here means the change was kept; generation adopts it on completion.
    if (generationState === "loading") return;
    if (!sameMapArea(sourceProject, target)) { status = "Map area changed · regenerate terrain data"; return; }
    status = changed.includes("verticalExaggeration") && target.outputMode === "stack" && target.verticalExaggeration !== sourceProject.verticalExaggeration
      ? "Vertical exaggeration changed · regenerate terrain" : `${action} applied`;
    // A cosmetic change leaves any pending refresh to finish on its own.
    if (keepsWork || !sourceChanged.some((key) => !COSMETIC_KEYS.has(key))) return;
    const kind: PreviewUpdateKind = sourceChanged.some((key) => key.startsWith("show")) ? "details" : sourceChanged.every((key) => key === "markers" || key === "customLines") ? "customData" : "fabrication";
    void refreshPreview(kind, 0);
  }
  function undo(): void { const previous = projectHistory.undo(project); if (previous) restoreProject(previous, "Undo"); }
  function redo(): void { const next = projectHistory.redo(project); if (next) restoreProject(next, "Redo"); }

  function invalidatePendingPreview(): void {
    const wasGenerating = generationState === "loading";
    generationAbort?.abort();
    pipeline.invalidate();
    detailsUpdating = false;
    if (wasGenerating) generationState = "idle";
  }

  const styleOf = (config: ProjectConfigV1) => JSON.stringify([config.lineStyle, config.textStyle]);

  function projectForPreview(config: ProjectConfigV1, base = sourceProject): ProjectConfigV1 {
    return config.outputMode === "stack" && base.verticalExaggeration !== config.verticalExaggeration
      ? { ...config, verticalExaggeration: base.verticalExaggeration }
      : config;
  }

  /**
   * Rebuild the preview for the current project from the retained source, loading only missing map data.
   * A `quiet` refresh keeps the status line and generation state, so a failure or cancellation message stays visible.
   */
  function refreshPreview(kind: PreviewUpdateKind, delayMs: number, { quiet = false }: { quiet?: boolean } = {}): Promise<void> {
    const nextProject = project;
    const previewProject = projectForPreview(nextProject);
    if (!sameMapArea(sourceProject, nextProject)) { if (!quiet) status = previewStaleAreaStatus(kind, nextProject); return Promise.resolve(); }
    const fromProject = sourceProject;
    const fromSource = activeSource;
    const patch = projectPatch(fromProject, previewProject);
    detailsUpdating = true;
    if (!quiet) status = previewPendingStatus(kind, nextProject);
    return pipeline.runPreviewUpdate({
      config: previewProject,
      prepareSource: async (signal) => (await preparedSources()).prepare(fromSource, fromProject, previewProject, nextProject, signal),
      onCommit: (next, source) => {
        addPreviewWarning(next, source);
        // Cosmetic edits do not supersede a refresh, so keep the latest name.
        geometry = { ...next, projectName: project.name }; activeSource = source; sourceProject = previewProject;
        selectedLayer = (kind === "details" ? layerForEnabledDetail(next, patch) : undefined) ?? Math.min(selectedLayer, Math.max(0, next.layers.length - 1));
        if (quiet) return;
        if (generationState === "error") generationState = "ready";
        status = previewUpdatedStatus(kind, source, nextProject, sourceRequirements(nextProject));
      },
      onError: (error) => {
        if (quiet) { console.error("TopoStack could not restyle the preview.", error); return; }
        generationState = "error";
        status = error instanceof Error ? error.message : kind === "details" ? "Could not update map details." : "Could not update the output geometry.";
      },
      onSettled: (current) => { if (current) detailsUpdating = false; },
    }, delayMs);
  }

  function updateMapDetails(patch: Partial<ProjectConfigV1>, delayMs = PREVIEW_REFRESH_DELAY_MS): Promise<void> {
    updateProject(patch);
    return refreshPreview("details", delayMs);
  }

  function updateFabrication(patch: Partial<ProjectConfigV1>, delayMs = PREVIEW_REFRESH_DELAY_MS): Promise<void> {
    const updatesCustomData = patch.markers !== undefined || patch.customLines !== undefined;
    const nextWidth = patch.widthMm ?? project.widthMm;
    const nextHeight = patch.heightMm ?? project.heightMm;
    const maximumNorthArrowSize = edits.northArrowMaximumMm(nextWidth, nextHeight);
    if ((patch.widthMm !== undefined || patch.heightMm !== undefined) && (patch.northArrowSizeMm ?? project.northArrowSizeMm) > maximumNorthArrowSize) {
      patch = { ...patch, northArrowSizeMm: maximumNorthArrowSize };
    }
    updateProject(patch);
    // A style edit kept a running Generate alive; it renders the new style itself.
    if (generationState === "loading") return Promise.resolve();
    return refreshPreview(updatesCustomData ? "customData" : "fabrication", delayMs);
  }

  async function generate(): Promise<void> {
    invalidatePendingPreview();
    const revision = pipeline.revision;
    const controller = new AbortController(); generationAbort = controller;
    const generationProject: ProjectConfigV1 = { ...project, location: { ...project.location, bounds: boundsForProject(project) } };
    generationState = "loading"; status = "Fetching elevation tiles…";
    trackUsage("generation_started", generationProject.outputMode);
    const progressToast = showToast({ type: "info", message: "Building terrain layers…", duration: 0 });
    // Throws at each await boundary once canceled (AbortError) or superseded by a newer edit.
    const checkpoint = () => { controller.signal.throwIfAborted(); if (!pipeline.isCurrent(revision)) throw new DOMException("Generation superseded", "AbortError"); };
    try {
      const loaded = await loadTerrain(generationProject, controller.signal);
      checkpoint();
      status = "Tracing and repairing contours…";
      let builtProject = generationProject;
      let next = await pipeline.generate(builtProject, loaded.source, revision);
      checkpoint();
      // Styling edited during the run did not cancel it; render again until the style is current.
      while (styleOf(builtProject) !== styleOf(project)) {
        builtProject = { ...builtProject, lineStyle: project.lineStyle, textStyle: project.textStyle };
        next = await pipeline.generate(builtProject, loaded.source, revision);
        checkpoint();
      }
      if (loaded.fallback) next.warnings.push({ code: "DATA_FALLBACK", message: `The map service was unavailable, so this preview uses deterministic sample terrain.${loaded.fallbackReason ? ` (${loaded.fallbackReason})` : ""}` });
      if (loaded.waterWarning) next.warnings.push({ code: "LAKE_DATA_UNAVAILABLE", message: `Water outlines could not be applied, so the terrain has no water adjustment. (${loaded.waterWarning})` });
      // Cosmetic edits deliberately do not cancel expensive terrain work. Merge
      // their latest values instead of replacing them with the request snapshot.
      const completedProject = { ...builtProject, name: project.name, explodedPreview: project.explodedPreview };
      const completedGeometry = { ...next, projectName: completedProject.name };
      dismissedWarnings = [];
      void sourcePreparation?.then((cache) => cache.clear(), () => undefined);
      geometry = completedGeometry; project = completedProject; activeSource = loaded.source; sourceProject = completedProject; selectedLayer = featuredLayerIndex(completedGeometry); mode = completedProject.outputMode === "engraving" ? "engraving" : threeUnavailable ? "2d" : "3d"; generationState = "ready";
      trackUsage(exportBlockReason(completedGeometry, completedProject) ? "generation_failed" : "generation_succeeded", completedProject.outputMode);
      const outcome = {
        fallback: loaded.fallback, fallbackReason: loaded.fallbackReason, waterWarning: loaded.waterWarning,
        vectorUnavailable: next.vectorStatus !== "available" && (generationProject.showRoads || generationProject.showTrails || generationProject.showWater || generationProject.showBoundaries || (generationProject.outputMode === "stack" && generationProject.showWaterDepth)),
        lakeUnavailable: generationProject.outputMode === "stack" && generationProject.showWaterDepth && next.lakeDataStatus !== "available",
      };
      status = generationStatus(outcome, generationProject, next);
      void showToast(generationToast(outcome, generationProject));
    } catch (error) {
      if (!pipeline.isCurrent(revision)) { trackUsage("generation_cancelled", generationProject.outputMode); return; }
      const canceled = controller.signal.aborted || isAbortError(error);
      trackUsage(canceled ? "generation_cancelled" : "generation_failed", generationProject.outputMode);
      if (canceled) { generationState = "idle"; status = "Generation canceled"; }
      else { generationState = "error"; status = error instanceof Error ? error.message : "Generation failed. Check the location and try again."; void showToast({ type: "error", message: "Could not generate terrain" }); }
      // Style edits made during the run skipped their own refresh, expecting this
      // generation to render them. Apply them to the retained preview instead.
      if (styleOf(project) !== styleOf(sourceProject)) void refreshPreview("fabrication", 0, { quiet: true });
    } finally {
      if (generationAbort === controller) generationAbort = undefined;
      void progressToast.then((toast) => toast && window.atomm ? window.atomm.ui.closeToast(toast) : undefined).catch(() => undefined);
    }
  }
  function cancelGeneration(): void { generationAbort?.abort(); pipeline.cancelGeometry(new DOMException("Generation canceled", "AbortError")); }

  function showToast(options: Parameters<NonNullable<typeof window.atomm>["ui"]["toast"]>[0]): Promise<string | undefined> {
    if (!window.atomm) return Promise.resolve(undefined);
    return window.atomm.ui.toast(options).catch(() => undefined);
  }

  function downloadProject(option: DownloadOption): Promise<void> {
    return downloadWithNotice({ option, geometry, project, notice: exportNotice, track: (event) => trackUsage(event, project.outputMode, "browser") });
  }
  async function importProject(file: File | undefined): Promise<void> {
    if (!file) return;
    // A rejected file leaves a running Generate alone: report it on the status line only.
    const reportImportError = (message: string) => { status = message; if (generationState !== "loading") generationState = "error"; };
    if (file.size > MAX_PROJECT_FILE_BYTES) { reportImportError("Project file must be 2 MB or smaller."); if (importInput) importInput.value = ""; return; }
    try { const parsed: unknown = JSON.parse(await file.text()); const candidate = parsed && typeof parsed === "object" && "project" in parsed ? (parsed as { project: unknown }).project : parsed; const imported = parseProject(candidate); const source = createSyntheticSource(imported); invalidatePendingPreview(); projectHistory.push(project); dismissedWarnings = []; replaceSourceProject(imported, source); generationState = "ready"; status = "Project imported · generate to refresh its terrain"; }
    catch (error) { reportImportError(error instanceof Error ? error.message : "Could not import this project."); }
    finally { if (importInput) importInput.value = ""; }
  }
</script>

<svelte:head>
  <meta name="theme-color" content={themeColor} />
</svelte:head>

{#snippet projectControls()}
          <label class="project-name"><span>Project name</span><Input aria-label="Project name" maxlength={MAX_PROJECT_NAME_LENGTH} value={project.name} oninput={(event) => updateProject({ name: event.currentTarget.value })} /></label>
          <div class="history-actions">
            <IconButton label="Undo" onclick={undo} disabled={!historyAvailability.canUndo}><Undo2 size={17} /></IconButton>
            <IconButton label="Redo" onclick={redo} disabled={!historyAvailability.canRedo}><Redo2 size={17} /></IconButton>
            <IconButton label="Import project JSON" onclick={() => importInput.click()}><Upload size={17} /></IconButton>
            <input bind:this={importInput} class="ldt-visually-hidden" type="file" accept="application/json,.json" onchange={(event) => void importProject(event.currentTarget.files?.[0])} />
          </div>
{/snippet}

{#snippet outputControls()}
          <div class="ldt-toggle-group ldt-toggle-group--sm output-mode-switch" role="radiogroup" aria-label="Output type">
            <button type="button" class="ldt-toggle-group__item" role="radio" aria-label="Layered relief" aria-checked={project.outputMode === "stack"} data-state={project.outputMode === "stack" ? "on" : "off"} tabindex={project.outputMode === "stack" ? 0 : -1} onclick={() => { mode = threeUnavailable ? "2d" : "3d"; void updateFabrication({ outputMode: "stack" }); }} onkeydown={navigateChoice}>
              <span class="output-mode-switch__icon" aria-hidden="true"><Layers3 size={16} strokeWidth={2.2} /></span>
              <span>Layered</span>
            </button>
            <button type="button" class="ldt-toggle-group__item" role="radio" aria-label="Flat engraving" aria-checked={project.outputMode === "engraving"} data-state={project.outputMode === "engraving" ? "on" : "off"} tabindex={project.outputMode === "engraving" ? 0 : -1} onclick={() => { mode = "engraving"; void updateFabrication({ outputMode: "engraving" }); }} onkeydown={navigateChoice}>
              <span class="output-mode-switch__icon" aria-hidden="true"><PenTool size={16} strokeWidth={2.2} /></span>
              <span>Flat</span>
            </button>
          </div>
          <span class="context-export-status" class:ready={exportReady && exportPhase !== "error"} class:error={!exportReady || exportPhase === "error"}>{exportPhase === "preparing" ? "Preparing files" : exportPhase === "ready" ? "Export ready" : exportPhase === "error" ? "Export failed" : exportReady ? "Ready to export" : "Generate before export"}</span>
{/snippet}

{#snippet setupControls()}
        <Section class="config-section" aria-labelledby="atomm-setup-title">
          <button type="button" class="section-disclosure" id="atomm-setup-title" aria-expanded={openSections.setup} aria-controls="section-setup" onclick={() => toggleSection("setup")}>
            <span class="section-number">01–02</span>
            <span class="section-title">Project setup<small>{sectionSummary("setup")}</small></span>
            <ChevronDown size={16} class={openSections.setup ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
          </button>
          <div id="section-setup" class="section-content" hidden={!openSections.setup}>
          <div class="setup-location">
            <div class="subsection-label-row">
              <div class="subsection-label">Location</div>
              <span class:pending={terrainDataStale} class="terrain-data-badge">{terrainDataStale ? "Regeneration pending" : "Requires regeneration"}</span>
            </div>
          <button bind:this={locationTrigger} class="location-card" onclick={() => searchOpen = true}>
            <span class="location-icon"><MapIcon size={18} /></span>
            <span>
              <strong>{project.location.label.split(",")[0]}</strong>
              <small>{project.location.label.split(",").slice(1).join(",") || "Selected coordinates"}</small>
            </span>
            <Search size={17} />
          </button>
          <div class="preset-row">
            {#each PRESETS as preset}
              <button onclick={() => choosePlace(preset)}>{preset.label.split(",")[0].replace("Mount ", "Mt. ")}</button>
            {/each}
          </div>
          </div>
          <p class:pending={terrainDataStale} class="terrain-data-note" aria-live="polite">
            {#if terrainDataStale}<strong>Terrain data is from the previous map area.</strong> Generate it before export.{:else}Changing the location or map area requires terrain regeneration.{/if}
            <span>Map details and linework update automatically. Changing the cut aspect ratio changes the map area and requires terrain regeneration. Vertical exaggeration also requires regeneration.</span>
          </p>
          </div>
        </Section>
{/snippet}

{#snippet parameterControls()}
        <Section class="config-section" aria-labelledby="atomm-size-title">
          <button type="button" class="section-disclosure" id="atomm-size-title" aria-expanded={openSections.size} aria-controls="section-size" onclick={() => toggleSection("size")}>
            <span class="section-number">03</span>
            <span class="section-title">{project.outputMode === "engraving" ? "Artwork size" : "Cut size"}<small>{sectionSummary("size")}</small></span>
            <ChevronDown size={16} class={openSections.size ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
          </button>
          <div id="section-size" class="section-content" hidden={!openSections.size}>
          {#if !embeddedInPlatform}{@render unitControls()}{/if}
          <div class="ldt-toggle-group shape-switch" role="radiogroup" aria-label="Crop shape">
            {#each SHAPE_OPTIONS as option}
              <button type="button" class="ldt-toggle-group__item" role="radio" aria-checked={project.cropShape === option.value} data-state={project.cropShape === option.value ? "on" : "off"} tabindex={project.cropShape === option.value ? 0 : -1} onclick={() => void updateFabrication({ cropShape: option.value as ProjectConfigV1["cropShape"], ...(option.value === "circle" ? { heightMm: project.widthMm } : {}) })} onkeydown={navigateChoice}>{#if option.value === "rectangle"}<Square size={15} />{:else}<Circle size={15} />{/if}{option.label}</button>
            {/each}
          </div>
          <div class="field-stack">
            <Field label="Width" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Width" value={shownLength(project.widthMm)} min={project.units === "imperial" ? 0.001 : 0.01} max={displayLength(MAX_PROJECT_DIMENSION_MM, project.units)} step={project.units === "imperial" ? 0.01 : 1} oninput={(event) => { if (event.currentTarget.value !== "") { const widthMm = storedLength(event.currentTarget.valueAsNumber); void updateFabrication({ widthMm, ...(project.cropShape === "circle" ? { heightMm: widthMm } : {}) }); } }} onValueChange={(width) => { const widthMm = storedLength(width); if (widthMm !== project.widthMm) void updateFabrication({ widthMm, ...(project.cropShape === "circle" ? { heightMm: widthMm } : {}) }); }} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
            <Field label="Height" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Height" value={shownLength(project.heightMm)} min={project.units === "imperial" ? 0.001 : 0.01} max={displayLength(MAX_PROJECT_DIMENSION_MM, project.units)} step={project.units === "imperial" ? 0.01 : 1} disabled={project.cropShape === "circle"} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ heightMm: storedLength(event.currentTarget.valueAsNumber) })} onValueChange={(height) => { const heightMm = storedLength(height); if (heightMm !== project.heightMm) void updateFabrication({ heightMm }); }} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
          </div>
          </div>
        </Section>

        <Section class="config-section" aria-labelledby="atomm-terrain-title">
          <button type="button" class="section-disclosure" id="atomm-terrain-title" aria-expanded={openSections.terrain} aria-controls="section-terrain" onclick={() => toggleSection("terrain")}>
            <span class="section-number">04</span>
            <span class="section-title">{project.outputMode === "engraving" ? "Contour design" : "Terrain layers"}<small>{sectionSummary("terrain")}</small></span>
            <ChevronDown size={16} class={openSections.terrain ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
          </button>
          <div id="section-terrain" class="section-content" hidden={!openSections.terrain}>
          {#if project.outputMode === "engraving"}
            <div class="range-field">
              <span class="range-field__label"><b>Contour density</b></span>
              <div class="range-field__row">
                <input type="range" aria-label="Contour density slider" min="4" max="40" step="1" value={project.engravingContourCount} oninput={(event) => void updateFabrication({ engravingContourCount: Number(event.currentTarget.value) })} />
                <span class="number-input number-input--compact"><NumberField label="Contour density" value={project.engravingContourCount} min={4} max={40} step={1} onValueChange={(value) => value !== project.engravingContourCount && void updateFabrication({ engravingContourCount: value })} /><em>lines</em></span>
              </div>
              <small><span>4 sparse</span><span>40 detailed</span></small>
            </div>
            <div class="field-stack">
              <Field label="Index contour" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Index contour interval" value={project.engravingIndexInterval} min={2} max={10} step={1} onValueChange={(value) => value !== project.engravingIndexInterval && void updateFabrication({ engravingIndexInterval: value })} /><em>every</em></span>{/snippet}</Field>
            </div>
            <div class="relief-summary">
              <PenTool size={20} />
              <span>
                <strong>{project.engravingContourCount} contour lines in one flat graphic</strong>
                <small>≈ {Math.round(displayElevation(contourInterval, project.units)).toLocaleString()} {shownElevationUnit} apart · every {project.engravingIndexInterval}th line emphasized</small>
              </span>
            </div>
          {:else}
          <div class="range-field">
            <span class="range-field__label vertical-exaggeration-heading"><b>Vertical exaggeration</b><span class:pending={verticalExaggerationStale} class="terrain-data-badge">{verticalExaggerationStale ? "Regeneration pending" : "Requires regeneration"}</span></span>
            <div class="range-field__row">
              <input type="range" aria-label="Vertical exaggeration slider" min={MIN_VERTICAL_EXAGGERATION} max={MAX_VERTICAL_EXAGGERATION} step="0.5" value={project.verticalExaggeration} oninput={(event) => updateVerticalExaggeration(Number(event.currentTarget.value))} />
              <span class="number-input number-input--compact"><NumberField label="Vertical exaggeration" value={project.verticalExaggeration} min={MIN_VERTICAL_EXAGGERATION} max={MAX_VERTICAL_EXAGGERATION} step={0.5} oninput={(event) => event.currentTarget.value !== "" && updateVerticalExaggeration(event.currentTarget.valueAsNumber)} onValueChange={updateVerticalExaggeration} /><em>×</em></span>
            </div>
            <small><span>{MIN_VERTICAL_EXAGGERATION}×</span><span>{MAX_VERTICAL_EXAGGERATION}×</span></small>
          </div>
          <div class="field-stack">
            <Field label="Material thickness" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Material" value={shownLength(project.materialThicknessMm)} min={shownLength(0.5)} max={shownLength(25)} step={project.units === "imperial" ? 0.01 : 0.1} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ materialThicknessMm: storedLength(event.currentTarget.valueAsNumber) })} onValueChange={(value) => { const materialThicknessMm = storedLength(value); if (materialThicknessMm !== project.materialThicknessMm) void updateFabrication({ materialThicknessMm }); }} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
          </div>
          <div class="relief-summary">
            <Mountain size={20} />
            <span>
              <strong>{Math.round(displayElevation(geometry.maxElevationM - geometry.minElevationM, project.units)).toLocaleString()} {shownElevationUnit} relief → {stackPlan.layerCount} layers, {shownLength(stackPlan.stackHeightMm)} {shownLengthUnit} tall</strong>
              <small>{stackPlan.verticalExaggeration.toFixed(1)}× applied{stackPlan.horizontalScale > 0 ? ` · scale 1:${Math.round(1 / stackPlan.horizontalScale).toLocaleString()}` : ""} · ≈ {Math.round(displayElevation(stackPlan.metersPerLayer, project.units)).toLocaleString()} {shownElevationUnit} per layer</small>
            </span>
          </div>
          {/if}
          </div>
        </Section>

        <Section class="config-section" aria-labelledby="atomm-details-title">
          <button type="button" class="section-disclosure" id="atomm-details-title" aria-expanded={openSections.details} aria-controls="section-details" onclick={() => toggleSection("details")}>
            <span class="section-number">05</span>
            <span class="section-title">Map details<small>{sectionSummary("details")}</small></span>
            <ChevronDown size={16} class={openSections.details ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
          </button>
          <div id="section-details" class="section-content" hidden={!openSections.details}>

          <div class="detail-column">
          <div class="detail-group">
            <p class="subgroup-heading">Terrain features</p>
            <div class="toggle-stack">
              <Switch checked={project.showRoads} onCheckedChange={(showRoads) => void updateMapDetails({ showRoads })} aria-label="Roads"><span class="toggle-label"><Minus size={16} />Roads</span></Switch>
              <Switch checked={project.showTrails} onCheckedChange={(showTrails) => void updateMapDetails({ showTrails })} aria-label="Trails"><span class="toggle-label"><Minus size={16} />Trails</span></Switch>
              <Switch checked={project.showTransportationLabels} onCheckedChange={(showTransportationLabels) => void updateMapDetails({ showTransportationLabels })} aria-label="Transportation labels"><span class="toggle-label"><Minus size={16} />Transportation labels</span></Switch>
              <div class="toggle-control">
                <Switch checked={project.showWater} onCheckedChange={(showWater) => void updateMapDetails({ showWater })} aria-label="Water outlines"><span class="toggle-label"><Waves size={16} />Water outlines</span></Switch>
                {#if project.outputMode === "engraving" && project.showWater}
                  <div class="toggle-settings">
                    <p class="subgroup-heading">Water fill</p>
                    <div class="ldt-toggle-group water-pattern-options" role="radiogroup" aria-label="Water fill pattern">
                      {#each WATER_FILL_PATTERNS as option}
                        <button type="button" class="ldt-toggle-group__item" role="radio" aria-checked={project.waterFillPattern === option.value} data-state={project.waterFillPattern === option.value ? "on" : "off"} tabindex={project.waterFillPattern === option.value ? 0 : -1} onclick={() => void updateFabrication({ waterFillPattern: option.value })} onkeydown={navigateChoice}>{option.label}</button>
                      {/each}
                    </div>
                    <small class="depth-note">Adds fabrication-ready vector marks inside water areas. None keeps outlines only.</small>
                  </div>
                {/if}
              </div>
              <Switch checked={project.showBoundaries} onCheckedChange={(showBoundaries) => void updateMapDetails({ showBoundaries })} aria-label="State and province boundaries"><span class="toggle-label"><MapIcon size={16} />State / province boundaries</span></Switch>
              <Switch checked={project.showCoordinateGrid} onCheckedChange={(showCoordinateGrid) => void updateMapDetails({ showCoordinateGrid })} aria-label="Latitude and longitude grid"><span class="toggle-label"><Grid3X3 size={16} />Latitude / longitude grid</span></Switch>
              {#if project.outputMode === "engraving"}
                <Switch checked={project.showEngravingBorder} onCheckedChange={(showEngravingBorder) => void updateFabrication({ showEngravingBorder })} aria-label="Engraved border"><span class="toggle-label"><Square size={16} />Engraved border</span></Switch>
              {:else}
              <div class="toggle-control">
                <Switch checked={project.showWaterDepth} onCheckedChange={(showWaterDepth) => void updateMapDetails({ showWaterDepth })} aria-label="Water depth"><span class="toggle-label"><Waves size={16} />Water depth</span></Switch>
                {#if project.showWaterDepth}
                  <div class="toggle-settings">
                    <div class="range-field">
                      <span class="range-field__label"><b>Depth exaggeration</b></span>
                      <div class="range-field__row">
                        <input type="range" aria-label="Water depth exaggeration slider" min={MIN_WATER_DEPTH_EXAGGERATION} max={MAX_WATER_DEPTH_EXAGGERATION} step="0.25" value={project.waterDepthExaggeration} oninput={(event) => void updateFabrication({ waterDepthExaggeration: Number(event.currentTarget.value) })} />
                        <span class="number-input number-input--compact"><NumberField label="Water depth exaggeration" value={project.waterDepthExaggeration} min={MIN_WATER_DEPTH_EXAGGERATION} max={MAX_WATER_DEPTH_EXAGGERATION} step={0.25} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ waterDepthExaggeration: event.currentTarget.valueAsNumber })} onValueChange={(value) => value !== project.waterDepthExaggeration && void updateFabrication({ waterDepthExaggeration: value })} /><em>×</em></span>
                      </div>
                      <small><span>{MIN_WATER_DEPTH_EXAGGERATION}×</span><span>{MAX_WATER_DEPTH_EXAGGERATION}× terrain</span></small>
                    </div>
                    <small class="depth-note">Relative to the terrain's vertical scale, which water already follows. 1× keeps lakes and sea floor on the same scale as the hills.</small>
                    <Switch checked={project.fitLakeDepth} onCheckedChange={(fitLakeDepth) => void updateFabrication({ fitLakeDepth })} aria-label="Fit lake depth to available layers"><span class="toggle-label">Fit lake depth to available layers</span></Switch>
                    <small class="depth-note">Compresses lakes only when needed to preserve their floor shape within the stack. Shorelines stay fixed.</small>
                    {#each geometry.waterSurfaces.filter((lake) => lake.depthFitScale !== undefined) as lake (lake.id)}
                      <small class="depth-note">{lake.name ?? "Lake"}: {lake.appliedDepthExaggeration!.toFixed(2)}× terrain depth applied · {Math.round(lake.depthFitScale! * 100)}% of requested depth.</small>
                    {/each}
                  </div>
                {/if}
                {#if project.showWaterDepth && (activeSource.bathymetryStatus === "available" || activeSource.bathymetryStatus === "partial")}
                  <small class="depth-note">Surveyed lake-floor data is used where available. Gaps use existing terrain or modeled depths.</small>
                {/if}
                {#if project.showWaterDepth && modeledLakes.length}
                  <div class="toggle-settings">
                    <div class="subgroup-heading subgroup-heading--action">
                      <p>Maximum depth</p>
                      {#if hasDepthOverride}<button type="button" onclick={() => void updateFabrication({ waterDepthOverrides: {} })}>Reset</button>{/if}
                    </div>
                    <div class="field-stack">
                      {#each modeledLakes as lake (lake.id)}
                        <Field label={lake.name} class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label={`${lake.name} maximum depth`} value={shownDepth(lake.maxDepthM)} min={1} max={Math.round(displayElevation(12000, project.units))} onValueChange={(depth) => void setLakeDepth(lake.hylakId, depth)} /><em>{shownElevationUnit}</em></span>{/snippet}</Field>
                      {/each}
                    </div>
                    <small class="depth-note">Estimated from shoreline terrain slopes and GLOBathy/HydroLAKES depths. This is a modeled lake floor.</small>
                  </div>
                {/if}
                <div class="depth-note"><FeedbackButton label="Report lake data quality" type="lake" getContext={getFeedbackContext} /> <a href={`${base}/guides/how-lake-depths-work`} target="_blank" rel="noopener noreferrer">How lake depths work<span class="ldt-visually-hidden"> (opens in a new tab)</span></a></div>
              </div>
              {/if}
            </div>
          </div>

          {#if project.outputMode === "stack"}<div class="detail-group">
            <p class="subgroup-heading">Assembly</p>
            <div class="toggle-stack">
              <Switch checked={project.showAlignmentGuides} onCheckedChange={(showAlignmentGuides) => void updateMapDetails({ showAlignmentGuides })} aria-label="Assembly guides"><span class="toggle-label"><Layers3 size={16} />Assembly guides</span></Switch>
            </div>
          </div>{/if}

          </div>
          <div class="detail-column">
          <div class="detail-group">
            <p class="subgroup-heading">Annotations</p>
            <div class="toggle-stack">
              <div class="toggle-control">
                <Switch checked={project.showElevationLabels} onCheckedChange={(showElevationLabels) => void updateMapDetails({ showElevationLabels })} aria-label="Elevation labels"><span class="toggle-label"><Mountain size={16} />Elevation labels</span></Switch>
                {#if project.showElevationLabels}
                  <div class="toggle-settings">
                    <p class="subgroup-heading">Preferred position</p>
                    <div class="field-stack field-stack--offsets">
                      <Field label="Label X" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Label X" value={Math.round(project.elevationLabelPosition.x * 100)} min={-90} max={90} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ elevationLabelPosition: { ...project.elevationLabelPosition, x: event.currentTarget.valueAsNumber / 100 } })} onValueChange={(x) => x !== Math.round(project.elevationLabelPosition.x * 100) && void updateFabrication({ elevationLabelPosition: { ...project.elevationLabelPosition, x: x / 100 } })} /><em>%</em></span>{/snippet}</Field>
                      <Field label="Label Y" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Label Y" value={Math.round(project.elevationLabelPosition.y * 100)} min={-90} max={90} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ elevationLabelPosition: { ...project.elevationLabelPosition, y: event.currentTarget.valueAsNumber / 100 } })} onValueChange={(y) => y !== Math.round(project.elevationLabelPosition.y * 100) && void updateFabrication({ elevationLabelPosition: { ...project.elevationLabelPosition, y: y / 100 } })} /><em>%</em></span>{/snippet}</Field>
                    </div>
                  </div>
                {/if}
              </div>

              <div class="toggle-control">
                <Switch checked={project.showNorthArrow} onCheckedChange={(showNorthArrow) => void updateMapDetails({ showNorthArrow })} aria-label="North arrow"><span class="toggle-label"><Compass size={16} />North arrow</span></Switch>
                {#if project.showNorthArrow}
                  <div class="toggle-settings">
                    <p class="subgroup-heading">Compass design</p>
                    <div class="swatch-options" role="radiogroup" aria-label="North arrow design">
                      {#each NORTH_ARROW_OPTIONS as option}
                        <button type="button" role="radio" aria-checked={project.northArrowStyle === option.value} data-state={project.northArrowStyle === option.value ? "on" : "off"} tabindex={project.northArrowStyle === option.value ? 0 : -1} onclick={() => void updateFabrication({ northArrowStyle: option.value })} onkeydown={navigateChoice}>
                          <svg viewBox="-52 -52 104 104" aria-hidden="true">{#each option.markings as marking}<path d={previewMarkingPath(marking)} />{/each}</svg>
                          <span>{option.label}</span>
                        </button>
                      {/each}
                    </div>
                    <div class="range-field">
                      <span class="range-field__label"><b>Diameter</b></span>
                      <div class="range-field__row">
                        <input aria-label="North arrow size slider" type="range" min={displayLength(NORTH_ARROW_MIN_SIZE_MM, project.units)} max={displayLength(northArrowSizeLimitMm, project.units)} step={project.units === "imperial" ? 0.01 : 1} value={displayLength(project.northArrowSizeMm, project.units)} oninput={(event) => void updateFabrication({ northArrowSizeMm: storedLength(event.currentTarget.valueAsNumber) })} />
                        <span class="number-input number-input--compact"><NumberField label="North arrow size" value={shownTextSize(project.northArrowSizeMm)} min={displayLength(NORTH_ARROW_MIN_SIZE_MM, project.units)} max={displayLength(northArrowSizeLimitMm, project.units)} step={project.units === "imperial" ? 0.01 : 1} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ northArrowSizeMm: storedLength(event.currentTarget.valueAsNumber) })} onValueChange={(value) => { const sizeMm = storedLength(value); if (sizeMm !== project.northArrowSizeMm) void updateFabrication({ northArrowSizeMm: sizeMm }); }} /><em>{shownLengthUnit}</em></span>
                      </div>
                      <small><span>{shownTextSize(NORTH_ARROW_MIN_SIZE_MM)} {shownLengthUnit}</span><span>{shownTextSize(northArrowSizeLimitMm)} {shownLengthUnit}</span></small>
                    </div>
                    <div class="subgroup-heading subgroup-heading--action">
                      <p>Placement</p>
                      <button type="button" onclick={() => void updateFabrication({ northArrowPlacement: { ...project.northArrowPlacement, offset: { x: 0, y: 0 } } })}>Reset offset</button>
                    </div>
                    <div class="north-arrow-anchor-grid" role="radiogroup" aria-label="North arrow anchor">
                      {#each NORTH_ARROW_ANCHOR_OPTIONS as option}
                        <button type="button" role="radio" aria-label={option.label} title={option.label} aria-checked={project.northArrowPlacement.anchor === option.value} data-state={project.northArrowPlacement.anchor === option.value ? "on" : "off"} tabindex={project.northArrowPlacement.anchor === option.value ? 0 : -1} onclick={() => void updateFabrication({ northArrowPlacement: { anchor: option.value, offset: { x: 0, y: 0 } } })} onkeydown={navigateChoice}><span></span></button>
                      {/each}
                    </div>
                    <div class="field-stack field-stack--offsets">
                      <Field label="Offset X" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="North arrow offset X" value={Math.round(project.northArrowPlacement.offset.x * 100)} min={-100} max={100} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ northArrowPlacement: { ...project.northArrowPlacement, offset: { ...project.northArrowPlacement.offset, x: event.currentTarget.valueAsNumber / 100 } } })} onValueChange={(x) => x !== Math.round(project.northArrowPlacement.offset.x * 100) && void updateFabrication({ northArrowPlacement: { ...project.northArrowPlacement, offset: { ...project.northArrowPlacement.offset, x: x / 100 } } })} /><em>%</em></span>{/snippet}</Field>
                      <Field label="Offset Y" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="North arrow offset Y" value={Math.round(project.northArrowPlacement.offset.y * 100)} min={-100} max={100} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ northArrowPlacement: { ...project.northArrowPlacement, offset: { ...project.northArrowPlacement.offset, y: event.currentTarget.valueAsNumber / 100 } } })} onValueChange={(y) => y !== Math.round(project.northArrowPlacement.offset.y * 100) && void updateFabrication({ northArrowPlacement: { ...project.northArrowPlacement, offset: { ...project.northArrowPlacement.offset, y: y / 100 } } })} /><em>%</em></span>{/snippet}</Field>
                    </div>
                  </div>
                {/if}
              </div>

              <Switch checked={project.showScaleBar} onCheckedChange={(showScaleBar) => void updateMapDetails({ showScaleBar })} aria-label="Scale bar"><span class="toggle-label"><Minus size={16} />Scale bar</span></Switch>
            </div>
          </div>

          <div class="detail-group">
            <p class="subgroup-heading">Text engraving</p>
            <div class="swatch-options" role="radiogroup" aria-label="Engraving font">
              {#each FONT_OPTIONS as option}
                <button type="button" role="radio" aria-checked={project.textStyle.font === option.value} data-state={project.textStyle.font === option.value ? "on" : "off"} tabindex={project.textStyle.font === option.value ? 0 : -1} onclick={() => void updateFabrication({ textStyle: { ...project.textStyle, font: option.value } })} onkeydown={navigateChoice}>
                  <svg viewBox="0 -0.4 17 4.2" aria-hidden="true"><path stroke-linecap={option.value === "rounded" ? "round" : "butt"} stroke-linejoin={option.value === "rounded" ? "round" : "miter"} d={labelPathData("123m", { x: 0, y: 0 }, 0, 0, 0, { font: option.value, sizeMm: 3.1 })} /></svg>
                  <span>{option.label}</span>
                </button>
              {/each}
            </div>
            <div class="range-field">
              <span class="range-field__label"><b>Text size</b></span>
              <div class="range-field__row">
                <input aria-label="Text size slider" type="range" min={displayLength(2, project.units)} max={displayLength(10, project.units)} step={project.units === "imperial" ? 0.005 : 0.1} value={displayLength(project.textStyle.sizeMm, project.units)} oninput={(event) => void updateFabrication({ textStyle: { ...project.textStyle, sizeMm: storedLength(event.currentTarget.valueAsNumber) } })} />
                <span class="number-input number-input--compact"><NumberField label="Text size" value={shownTextSize(project.textStyle.sizeMm)} min={displayLength(2, project.units)} max={displayLength(10, project.units)} step={project.units === "imperial" ? 0.005 : 0.1} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ textStyle: { ...project.textStyle, sizeMm: storedLength(event.currentTarget.valueAsNumber) } })} onValueChange={(value) => { const sizeMm = storedLength(value); if (sizeMm !== project.textStyle.sizeMm) void updateFabrication({ textStyle: { ...project.textStyle, sizeMm } }); }} /><em>{shownLengthUnit}</em></span>
              </div>
              <small><span>{shownTextSize(2)} {shownLengthUnit}</span><span>{shownTextSize(10)} {shownLengthUnit}</span></small>
            </div>
          </div>
          </div>
          </div>
        </Section>

        <Section class="config-section custom-data-section" aria-labelledby="atomm-customData-title">
          <button type="button" class="section-disclosure" id="atomm-customData-title" aria-expanded={openSections.customData} aria-controls="section-custom-data" onclick={() => toggleSection("customData")}>
            <span class="section-number">06</span>
            <span class="section-title">Custom Data<small>{sectionSummary("customData")}</small></span>
            <ChevronDown size={16} class={openSections.customData ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
          </button>
          <div id="section-custom-data" class="section-content" hidden={!openSections.customData}>
            <p class="custom-data-intro">Add your own geographic annotations. Coordinates stay attached to the project and are clipped to the selected map area during engraving.</p>

            <div class="marker-editor">
              <div class="subgroup-heading subgroup-heading--action">
                <p><MapPin size={14} />Markers <span>{project.markers.length}</span></p>
                <button type="button" class="marker-add-button" onclick={() => applyCustomDataEdit(edits.addMarker(project, crypto.randomUUID()))} disabled={!edits.canAddMarker(project)}><Plus size={13} />Add marker</button>
              </div>
              {#if project.markers.length === 0}
                <small class="marker-empty">Add a marker, enter its latitude and longitude, then choose the symbol to engrave.</small>
              {:else}
                <div class="marker-list">
                  {#each project.markers as marker, index (marker.id)}
                    <div class="marker-card">
                      <div class="marker-card__header">
                        <b>Marker {index + 1}</b>
                        <button type="button" aria-label={`Remove marker ${index + 1}`} title="Remove marker" onclick={() => applyCustomDataEdit(edits.removeMarker(project, marker.id))}><Trash2 size={14} /></button>
                      </div>
                      <div class="field-stack marker-coordinate-fields">
                        <Field label="Latitude" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label={`Marker ${index + 1} latitude`} value={marker.lat} min={-MAX_LATITUDE} max={MAX_LATITUDE} step={0.0001} oninput={(event) => event.currentTarget.value !== "" && applyCustomDataEdit(edits.updateMarker(project, marker.id, { lat: event.currentTarget.valueAsNumber }))} onValueChange={(lat) => lat !== marker.lat && applyCustomDataEdit(edits.updateMarker(project, marker.id, { lat }))} /><em>°</em></span>{/snippet}</Field>
                        <Field label="Longitude" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label={`Marker ${index + 1} longitude`} value={marker.lon} min={-MAX_LONGITUDE} max={MAX_LONGITUDE} step={0.0001} oninput={(event) => event.currentTarget.value !== "" && applyCustomDataEdit(edits.updateMarker(project, marker.id, { lon: event.currentTarget.valueAsNumber }))} onValueChange={(lon) => lon !== marker.lon && applyCustomDataEdit(edits.updateMarker(project, marker.id, { lon }))} /><em>°</em></span>{/snippet}</Field>
                      </div>
                      <div class="marker-symbol-options" role="radiogroup" aria-label={`Marker ${index + 1} symbol`}>
                        {#each MARKER_OPTIONS as option}
                          <button type="button" role="radio" aria-label={option.label} title={option.label} aria-checked={marker.symbol === option.value} data-state={marker.symbol === option.value ? "on" : "off"} tabindex={marker.symbol === option.value ? 0 : -1} onclick={() => applyCustomDataEdit(edits.updateMarker(project, marker.id, { symbol: option.value }))} onkeydown={navigateChoice}>
                            <svg viewBox="-11 -11 22 22" aria-hidden="true">{#each option.paths as path}<path d={path.map((point, pathIndex) => `${pathIndex === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ")} />{/each}</svg>
                          </button>
                        {/each}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
              <small class="marker-note">Markers outside the selected crop remain saved but are not engraved.</small>
            </div>

            <div class="custom-line-editor">
              <div class="subgroup-heading subgroup-heading--action">
                <p><Route size={14} />Paths <span>{project.customLines.length}</span></p>
                <button type="button" class="marker-add-button" onclick={() => applyCustomDataEdit(edits.addCustomLine(project, crypto.randomUUID()))} disabled={!edits.canAddCustomLine(project)}><Plus size={13} />Add path</button>
              </div>
              {#if project.customLines.length === 0}
                <small class="marker-empty">Create a trail or boundary, then define its route with as many latitude/longitude points as needed.</small>
              {:else}
                <div class="marker-list">
                  {#each project.customLines as line, lineIndex (line.id)}
                    <div class="marker-card custom-line-card">
                      <div class="marker-card__header">
                        <b>Path {lineIndex + 1}</b>
                        <button type="button" aria-label={`Remove path ${lineIndex + 1}`} title="Remove path" onclick={() => applyCustomDataEdit(edits.removeCustomLine(project, line.id))}><Trash2 size={14} /></button>
                      </div>
                      <div class="custom-line-kind-options" role="radiogroup" aria-label={`Path ${lineIndex + 1} type`}>
                        {#each CUSTOM_LINE_OPTIONS as option}
                          <button type="button" role="radio" aria-checked={line.kind === option.value} data-state={line.kind === option.value ? "on" : "off"} tabindex={line.kind === option.value ? 0 : -1} onclick={() => applyCustomDataEdit(edits.updateCustomLine(project, line.id, { kind: option.value }))} onkeydown={navigateChoice}>
                            {#if option.value === "trail"}<Route size={14} />{:else}<MapIcon size={14} />{/if}{option.label}
                          </button>
                        {/each}
                      </div>
                      <div class="custom-point-list">
                        {#each line.points as point, pointIndex}
                          <div class="custom-point-row">
                            <div class="custom-point-heading">
                              <span>Point {pointIndex + 1}</span>
                              <button type="button" aria-label={`Remove point ${pointIndex + 1} from path ${lineIndex + 1}`} title={line.points.length <= 2 ? "A path needs at least two points" : "Remove point"} disabled={line.points.length <= 2} onclick={() => applyCustomDataEdit(edits.removeCustomLinePoint(project, line.id, pointIndex))}><Trash2 size={12} /></button>
                            </div>
                            <div class="field-stack marker-coordinate-fields">
                              <Field label="Latitude" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label={`Path ${lineIndex + 1} point ${pointIndex + 1} latitude`} value={point.lat} min={-MAX_LATITUDE} max={MAX_LATITUDE} step={0.0001} oninput={(event) => event.currentTarget.value !== "" && applyCustomDataEdit(edits.updateCustomLinePoint(project, line.id, pointIndex, { lat: event.currentTarget.valueAsNumber }))} onValueChange={(lat) => lat !== point.lat && applyCustomDataEdit(edits.updateCustomLinePoint(project, line.id, pointIndex, { lat }))} /><em>°</em></span>{/snippet}</Field>
                              <Field label="Longitude" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label={`Path ${lineIndex + 1} point ${pointIndex + 1} longitude`} value={point.lon} min={-MAX_LONGITUDE} max={MAX_LONGITUDE} step={0.0001} oninput={(event) => event.currentTarget.value !== "" && applyCustomDataEdit(edits.updateCustomLinePoint(project, line.id, pointIndex, { lon: event.currentTarget.valueAsNumber }))} onValueChange={(lon) => lon !== point.lon && applyCustomDataEdit(edits.updateCustomLinePoint(project, line.id, pointIndex, { lon }))} /><em>°</em></span>{/snippet}</Field>
                            </div>
                          </div>
                        {/each}
                      </div>
                      <button type="button" class="custom-point-add" onclick={() => applyCustomDataEdit(edits.addCustomLinePoint(project, line.id))} disabled={!edits.canAddCustomLinePoint(project, line)}><Plus size={13} />Add point</button>
                    </div>
                  {/each}
                </div>
              {/if}
              <small class="marker-note">Custom paths render even when built-in Trails or Boundaries are switched off.</small>
            </div>
          </div>
        </Section>

        <Section class="config-section linework-section" aria-labelledby="atomm-linework-title">
          <button type="button" class="section-disclosure" id="atomm-linework-title" aria-expanded={openSections.linework} aria-controls="section-linework" onclick={() => toggleSection("linework")}>
            <span class="section-number">07</span>
            <span class="section-title">Linework<small>{sectionSummary("linework")}</small></span>
            <ChevronDown size={16} class={openSections.linework ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
          </button>
          <div id="section-linework" class="section-content" hidden={!openSections.linework}>
          <div class="line-presets" role="radiogroup" aria-label="Linework preset">
            {#each LINE_PRESETS as preset}
              <button type="button" role="radio" aria-checked={activeLinePreset === preset.value} data-state={activeLinePreset === preset.value ? "on" : "off"} onclick={() => void updateFabrication({ lineStyle: { ...preset.style } })}>
                <svg viewBox="0 0 52 24" aria-hidden="true">
                  <path d="M2 5H50" stroke-width={preset.style.contourMm * 5} />
                  <path d="M2 12H50" stroke-width={preset.style.indexContourMm * 5} />
                  <path d="M2 19H50" stroke-width={preset.style.trailMm * 5} stroke-dasharray={trailPatternDash(preset.style)} />
                </svg>
                <span><b>{preset.label}</b><small>{preset.description}</small></span>
              </button>
            {/each}
          </div>
          <button type="button" class="linework-customize" aria-expanded={lineworkOpen} onclick={() => lineworkOpen = !lineworkOpen}>
            <span>{activeLinePreset ? "Customize preset" : "Custom linework"}</span>
            <ChevronDown size={14} class={lineworkOpen ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
          </button>
          {#if lineworkOpen}
            <div class="linework-controls">
              {#if project.outputMode === "engraving"}
                <div class="linework-group linework-group--fields">
                <p class="subgroup-heading">Topography</p>
                <div class="field-stack">
                  <Field label="Minor contours" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Minor contour width" value={shownLineWidth(project.lineStyle.contourMm)} min={displayLength(0.05, project.units)} max={displayLength(1.5, project.units)} step={project.units === "imperial" ? 0.001 : 0.01} onValueChange={(value) => void setLineWidth("contourMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
                  <Field label="Index contours" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Index contour width" value={shownLineWidth(project.lineStyle.indexContourMm)} min={displayLength(0.05, project.units)} max={displayLength(1.5, project.units)} step={project.units === "imperial" ? 0.001 : 0.01} onValueChange={(value) => void setLineWidth("indexContourMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
                </div>
                </div>
              {/if}
              <div class="linework-group linework-group--fields">
              <p class="subgroup-heading">Map features</p>
              <div class="field-stack">
                <Field label="Major roads" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Major road width" value={shownLineWidth(project.lineStyle.majorRoadMm)} min={displayLength(0.05, project.units)} max={displayLength(1.5, project.units)} step={project.units === "imperial" ? 0.001 : 0.01} onValueChange={(value) => void setLineWidth("majorRoadMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
                <Field label="Local roads" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Local road width" value={shownLineWidth(project.lineStyle.localRoadMm)} min={displayLength(0.05, project.units)} max={displayLength(1.5, project.units)} step={project.units === "imperial" ? 0.001 : 0.01} onValueChange={(value) => void setLineWidth("localRoadMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
                <Field label="Trails" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Trail width" value={shownLineWidth(project.lineStyle.trailMm)} min={displayLength(0.05, project.units)} max={displayLength(1.5, project.units)} step={project.units === "imperial" ? 0.001 : 0.01} onValueChange={(value) => void setLineWidth("trailMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
                <Field label="Water" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Water line width" value={shownLineWidth(project.lineStyle.waterMm)} min={displayLength(0.05, project.units)} max={displayLength(1.5, project.units)} step={project.units === "imperial" ? 0.001 : 0.01} onValueChange={(value) => void setLineWidth("waterMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
                <Field label="Boundaries" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Boundary line width" value={shownLineWidth(project.lineStyle.boundaryMm)} min={displayLength(0.05, project.units)} max={displayLength(1.5, project.units)} step={project.units === "imperial" ? 0.001 : 0.01} onValueChange={(value) => void setLineWidth("boundaryMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
                <Field label="Lat / long grid" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Coordinate grid line width" value={shownLineWidth(project.lineStyle.coordinateGridMm)} min={displayLength(0.05, project.units)} max={displayLength(1.5, project.units)} step={project.units === "imperial" ? 0.001 : 0.01} onValueChange={(value) => void setLineWidth("coordinateGridMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
              </div>
              </div>
              <div class="linework-group">
              <p class="subgroup-heading">Road appearance</p>
              <div class="ldt-toggle-group trail-pattern-options" role="radiogroup" aria-label="Major road style">
                {#each ROAD_STYLES as option}
                  <button type="button" class="ldt-toggle-group__item" role="radio" aria-checked={project.lineStyle.roadStyle === option.value} data-state={project.lineStyle.roadStyle === option.value ? "on" : "off"} tabindex={project.lineStyle.roadStyle === option.value ? 0 : -1} onclick={() => void updateFabrication({ lineStyle: { ...project.lineStyle, roadStyle: option.value } })} onkeydown={navigateChoice}>{option.label}</button>
                {/each}
              </div>
              {#if project.lineStyle.roadStyle === "outlined"}
                <div class="field-stack">
                  <Field label="Outline spacing" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Major road outline spacing" value={shownLineWidth(project.lineStyle.majorRoadSpacingMm)} min={displayLength(0.2, project.units)} max={displayLength(4, project.units)} step={project.units === "imperial" ? 0.005 : 0.05} onValueChange={(value) => void setLineWidth("majorRoadSpacingMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
                </div>
              {/if}
              <div class="ldt-toggle-group trail-pattern-options" role="radiogroup" aria-label="Road endpoint shape">
                {#each ROAD_CAPS as option}
                  <button type="button" class="ldt-toggle-group__item" role="radio" aria-checked={project.lineStyle.roadCap === option.value} data-state={project.lineStyle.roadCap === option.value ? "on" : "off"} tabindex={project.lineStyle.roadCap === option.value ? 0 : -1} onclick={() => void updateFabrication({ lineStyle: { ...project.lineStyle, roadCap: option.value } })} onkeydown={navigateChoice}>{option.label}</button>
                {/each}
              </div>
              </div>
              <div class="linework-group">
              <p class="subgroup-heading">Trail pattern</p>
              <div class="ldt-toggle-group trail-pattern-options" role="radiogroup" aria-label="Trail pattern">
                {#each TRAIL_PATTERNS as option}
                  <button type="button" class="ldt-toggle-group__item" role="radio" aria-checked={project.lineStyle.trailPattern === option.value} data-state={project.lineStyle.trailPattern === option.value ? "on" : "off"} tabindex={project.lineStyle.trailPattern === option.value ? 0 : -1} onclick={() => void updateFabrication({ lineStyle: { ...project.lineStyle, trailPattern: option.value } })} onkeydown={navigateChoice}>{option.label}</button>
                {/each}
              </div>
              </div>
              <div class="linework-group linework-group--fields">
              <p class="subgroup-heading">Finishing</p>
              <div class="field-stack">
                <Field label="Labels & guides" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Annotation width" value={shownLineWidth(project.lineStyle.annotationMm)} min={displayLength(0.05, project.units)} max={displayLength(1.5, project.units)} step={project.units === "imperial" ? 0.001 : 0.01} onValueChange={(value) => void setLineWidth("annotationMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
                {#if project.outputMode === "engraving"}<Field label="Border" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Border width" value={shownLineWidth(project.lineStyle.borderMm)} min={displayLength(0.05, project.units)} max={displayLength(1.5, project.units)} step={project.units === "imperial" ? 0.001 : 0.01} onValueChange={(value) => void setLineWidth("borderMm", value)} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>{/if}
              </div>
              </div>
              <small class="linework-note">Stroke widths are physical SVG values. Final engraved width also depends on focus, power, speed, material, and whether your laser software treats strokes as centerlines or filled shapes.</small>
            </div>
          {/if}
          </div>
        </Section>

        <Section class="config-section advanced-section" aria-labelledby="atomm-advanced-title">
          <button type="button" class="section-disclosure" id="atomm-advanced-title" aria-expanded={openSections.advanced} aria-controls="section-advanced" onclick={() => toggleSection("advanced")}>
            <span class="section-number">08</span>
            <span class="section-title">{project.outputMode === "engraving" ? "Artwork settings" : "Fabrication settings"}<small>{sectionSummary("advanced")}</small></span>
            <ChevronDown size={16} class={openSections.advanced ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
          </button>
          <div id="section-advanced" class="section-content" hidden={!openSections.advanced}>
            <div class="advanced-fields">
              <div class="toggle-stack">
                {#if project.outputMode === "stack"}<Switch checked={project.optimizeMaterialUse} onCheckedChange={(optimizeMaterialUse) => void updateFabrication({ optimizeMaterialUse })} aria-label="Material-saving nests"><span class="toggle-label"><Layers3 size={16} />Material-saving nests</span></Switch>{/if}
                <Switch checked={project.smoothing === 1} onCheckedChange={(smooth) => void updateFabrication({ smoothing: smooth ? 1 : 0 })} aria-label="Smooth contours"><span class="toggle-label"><Waves size={16} />Smooth contours</span></Switch>
              </div>
              <div class="field-stack">
                {#if project.outputMode === "stack" && project.optimizeMaterialUse}<Field label="Glue margin" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Glue margin" value={shownLength(project.glueMarginMm)} min={shownLength(2)} max={shownLength(25)} step={project.units === "imperial" ? 0.01 : 0.5} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ glueMarginMm: storedLength(event.currentTarget.valueAsNumber) })} onValueChange={(value) => { const glueMarginMm = storedLength(value); if (glueMarginMm !== project.glueMarginMm) void updateFabrication({ glueMarginMm }); }} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>{/if}
                {#if project.outputMode === "stack"}<Field label="Laser kerf" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Laser kerf" value={shownLength(project.laserKerfMm)} min={0} max={shownLength(1)} step={project.units === "imperial" ? 0.001 : 0.01} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ laserKerfMm: storedLength(event.currentTarget.valueAsNumber) })} onValueChange={(value) => { const laserKerfMm = storedLength(value); if (laserKerfMm !== project.laserKerfMm) void updateFabrication({ laserKerfMm }); }} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>{/if}
                <Field label="Minimum feature" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Minimum feature" value={shownLength(project.minimumFeatureMm)} min={shownLength(0.2)} max={shownLength(5)} step={project.units === "imperial" ? 0.01 : 0.1} oninput={(event) => event.currentTarget.value !== "" && void updateFabrication({ minimumFeatureMm: storedLength(event.currentTarget.valueAsNumber) })} onValueChange={(value) => { const minimumFeatureMm = storedLength(value); if (minimumFeatureMm !== project.minimumFeatureMm) void updateFabrication({ minimumFeatureMm }); }} /><em>{shownLengthUnit}</em></span>{/snippet}</Field>
              </div>
            </div>
          </div>
        </Section>
{/snippet}

{#snippet generationControls()}
      <div class="generate-dock">
        {#if geometry.terrainSelection}
          <details class="terrain-source-summary">
            <summary>Terrain sources</summary>
            <FeedbackButton label="Report terrain data quality" type="terrain" getContext={getFeedbackContext} />
            {#each geometry.terrainSelection.sources as source}
              <p>{source.name} · {Math.round(source.fraction * 100)}%{#if source.nativeResolutionM} · {source.nativeResolutionM} m source{/if}<br />{source.verticalDatum}</p>
            {/each}
            {#if geometry.terrainSelection.sources.every((source) => source.id === "mapzen")}<p>No preferred terrain was applied to this selection.</p>{/if}
            {#each geometry.terrainSelection.attempts.filter((attempt) => attempt.status === "unavailable") as attempt}<p>{attempt.name} unavailable; {geometry.warnings.some((warning) => warning.code === "TERRAIN_SOURCE_FALLBACK") ? "using fallback terrain" : "another terrain source covered this area"}.</p>{/each}
            {#if terrainDataStale}<p>Sources shown are for the last generated terrain.</p>{/if}
          </details>
        {/if}
        <div class={`status-line status-${previewBusy ? "loading" : generationState}`} role="status" aria-live="polite"><span></span>{statusLine({ generationState, status, detailsUpdating, terrainDataStale, terrainDataAction, verticalExaggerationStale, exportReady, exportBlockedBy, sourceKind: geometry.sourceKind })}</div>
        <Button variant="primary" class="generate-button" onclick={() => generationState === "loading" ? cancelGeneration() : void generate()}>{#if generationState === "loading"}<X size={18} /> Cancel generation{:else}<Sparkles size={18} /> {geometry.sourceKind === "real" ? terrainDataStale ? "Regenerate terrain data" : "Regenerate terrain" : "Generate terrain"}{/if}</Button>
      </div>
{/snippet}

{#snippet previewContent()}
    <section class="preview-panel" class:engraving-preview-panel={project.outputMode === "engraving"}>
      <div class="preview-toolbar"><div class="ldt-toggle-group mode-switch" role="radiogroup" aria-label="Preview mode">{#each previewModeOptions as option}<button type="button" class="ldt-toggle-group__item" role="radio" aria-checked={mode === option.value} data-state={mode === option.value ? "on" : "off"} tabindex={mode === option.value ? 0 : -1} onclick={() => { if (option.value === "2d" && selectedLayer === 0) selectedLayer = featuredLayerIndex(geometry); previewNotice = ""; if (option.value === "3d") threeUnavailable = false; mode = option.value as PreviewMode; }} onkeydown={navigateChoice}>{#if option.value === "map"}<MapIcon size={15} />{:else if option.value === "engraving"}<PenTool size={15} />{:else if option.value === "2d"}<Layers3 size={15} />{:else}<Box size={15} />{/if}{embeddedInPlatform ? option.value === "2d" ? "2D" : option.value === "3d" ? "3D" : option.label : option.label}</button>{/each}</div><div class="preview-readout"><span>{shownLength(project.widthMm)} × {shownLength(project.heightMm)} {shownLengthUnit}</span><span>{Math.round(displayElevation(geometry.minElevationM, project.units)).toLocaleString()}–{Math.round(displayElevation(geometry.maxElevationM, project.units)).toLocaleString()} {shownElevationUnit}</span></div></div>
      <div class="preview-stage" aria-busy={previewBusy} data-road-markings={detailCounts.road} data-trail-markings={detailCounts.trail} data-transportation-label-markings={detailCounts.transportationLabel} data-water-markings={detailCounts.water} data-contour-markings={detailCounts.contour} data-alignment-markings={detailCounts.alignment} data-elevation-markings={detailCounts.elevation} data-north-markings={detailCounts.north} data-scale-markings={detailCounts.scale} data-marker-markings={detailCounts.marker} data-custom-line-markings={detailCounts.customLine}><FeedbackButton edge getContext={getFeedbackContext} />{#if mode === "map"}{#if MapCanvas}<MapCanvas {project} onSelectionResize={(widthMm, heightMm, bounds) => { void updateFabrication({ widthMm, heightMm, location: { ...project.location, bounds } }); }} onUnavailable={(reason) => { mode = project.outputMode === "engraving" ? "engraving" : "2d"; previewNotice = reason === "load-failed" ? "Map could not load · check your connection or choose a location using search or coordinates" : "Map is unavailable in this browser · choose a location using search or coordinates"; }} onLocationChange={(lat: number, lon: number, zoom: number, bounds: GeoBounds) => updateLocation({ lat, lon, zoom, bounds, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` })} />{:else}<div class="preview-loading">Loading map…</div>{/if}{:else if mode === "engraving"}{#if EngravingPreview}<EngravingPreview {geometry} {project} cropShape={sourceProject.cropShape} />{:else if engravingPreview.failed}<div class="preview-loading preview-load-failed" role="alert">Engraving preview could not load<button type="button" class="btn btn-secondary" onclick={() => engravingPreview.load()}>Retry</button></div>{:else}<div class="preview-loading">Loading engraving…</div>{/if}{:else if mode === "2d"}{#if TwoDPreview}<TwoDPreview {geometry} {selectedLayer} />{:else if twoDPreview.failed}<div class="preview-loading preview-load-failed" role="alert">Cut preview could not load<button type="button" class="btn btn-secondary" onclick={() => twoDPreview.load()}>Retry</button></div>{:else}<div class="preview-loading">Loading cut preview…</div>{/if}{:else if ThreePreview}<ThreePreview {geometry} exploded={explodedPreview} onUnavailable={() => { threeUnavailable = true; mode = "2d"; previewNotice = "3D is unavailable in this browser · showing cut layers"; }} />{:else}<div class="preview-loading">Loading 3D preview…</div>{/if}{#if mode !== "map"}<div class="preview-attribution">Map data © <a href={OSM_ATTRIBUTION.url} target="_blank" rel="noreferrer">{OSM_ATTRIBUTION.name}</a> · <a href={`${base}/attribution`} target="_blank" rel="noopener noreferrer">All sources<span class="ldt-visually-hidden"> (opens in a new tab)</span></a></div>{/if}{#if previewBusy}<div class:preview-update-overlay={detailsUpdating && generationState !== "loading"} class="generation-overlay" role="status" aria-live="polite" style:pointer-events={detailsUpdating && generationState !== "loading" ? "none" : undefined}><div class="contour-loader"><span></span><span></span><span></span></div><strong>{previewBusyLabel}</strong><small>{status}</small>{#if embeddedInPlatform && generationState === "loading"}<span class="atomm-generation-step">Step {status.startsWith("Fetching") ? 1 : 2} of 2</span><button type="button" class="btn btn-secondary" onclick={cancelGeneration}>Cancel generation</button>{/if}</div>{/if}{#if visibleWarnings.length || previewNotice || lakeDepthFittingOn}
          <div class="warning-stack">
            {#if lakeDepthFittingOn}
              <div class="preview-warning preview-notice" role="status">
                <span class="warning-icon" aria-hidden="true"><Waves size={12} /></span>
                <p>Lake depth fitting is on. <button type="button" class="warning-action" disabled={previewBusy} onclick={() => void updateFabrication({ fitLakeDepth: false })}>Use manual depth</button></p>
              </div>
            {/if}
            {#if previewNotice}
              <div class="preview-warning preview-notice" role="status">
                <span class="warning-icon" aria-hidden="true">!</span>
                <p>{previewNotice}</p>
                <button type="button" class="warning-dismiss" aria-label={`Dismiss notice: ${previewNotice}`} title="Dismiss notice" onclick={(event) => dismissPreviewWarning(event)}><X size={14} aria-hidden="true" /></button>
              </div>
            {/if}
            {#each visibleWarnings as warning (`${warning.code}-${warning.message}`)}
              <div class="preview-warning">
                <span class="warning-icon" aria-hidden="true">!</span>
                <p>{warning.message}{#if warning.code === "LAKE_DEPTH_PREDICTED"} <a href={`${base}/guides/how-lake-depths-work`} target="_blank" rel="noopener noreferrer">How lake depths work<span class="ldt-visually-hidden"> (opens in a new tab)</span></a>{/if}{#if warning.action === "fit-lake-depth" && !project.fitLakeDepth} <button type="button" class="warning-action" disabled={previewBusy} onclick={() => void updateFabrication({ fitLakeDepth: true })}>Fit depth</button>{/if}</p>
                <button type="button" class="warning-dismiss" aria-label={`Dismiss warning: ${warning.message}`} title="Dismiss warning" onclick={(event) => dismissPreviewWarning(event, `${warning.code}-${warning.message}`)}><X size={14} aria-hidden="true" /></button>
              </div>
            {/each}
          </div>
        {/if}</div>
      {#if !embeddedInPlatform}{@render layerControls()}{/if}
    </section>
{/snippet}

{#snippet layerControls()}
      {#if project.outputMode === "stack"}<div class="layer-dock"><div class="layer-heading"><span><Layers3 size={16} /><b>Layer {selectedLayer + 1}</b> of {geometry.layers.length}</span><strong>{layerTicks[selectedLayer]?.toLocaleString()} {shownElevationUnit}</strong></div><input class="layer-range" type="range" min="0" max={Math.max(0, geometry.layers.length - 1)} value={selectedLayer} oninput={(event) => { selectedLayer = Number(event.currentTarget.value); if (mode === "3d") mode = "2d"; }} /><div class="layer-scale"><span>{layerTicks[0]?.toLocaleString()} {shownElevationUnit}</span><span>{layerTicks[Math.floor(layerTicks.length / 2)]?.toLocaleString()} {shownElevationUnit}</span><span>{layerTicks.at(-1)?.toLocaleString()} {shownElevationUnit}</span></div>{#if mode === "3d"}<label class="explode-control"><span>Stack</span><input type="range" min="0" max="1" step="0.05" value={explodedPreview} oninput={(event) => { explodedDrag = Number(event.currentTarget.value); }} onchange={(event) => { explodedDrag = undefined; updateProject({ explodedPreview: Number(event.currentTarget.value) }); }} /><span>Exploded</span></label>{/if}</div>{/if}
{/snippet}

{#snippet unitControls()}
          <div class="ldt-toggle-group unit-switch" role="radiogroup" aria-label="Display units">
            {#each UNIT_OPTIONS as option}
              <button type="button" class="ldt-toggle-group__item" role="radio" aria-checked={project.units === option.value} data-state={project.units === option.value ? "on" : "off"} tabindex={project.units === option.value ? 0 : -1} onclick={() => void updateFabrication({ units: option.value as ProjectConfigV1["units"] })} onkeydown={navigateChoice}>{option.label}</button>
            {/each}
          </div>
{/snippet}

{#if embeddedInPlatform}
  {#if AtommWorkbench}<AtommWorkbench ready={atommReady} blockedReason={exportBlockedBy} preparing={exportPhase === "preparing"} {exportPhase} {exportTitle} {exportDetail}>
    {#snippet leadHeader()}{@render projectControls()}{/snippet}
    {#snippet lead()}{@render outputControls()}{@render setupControls()}{/snippet}
    {#snippet generate()}{@render generationControls()}{/snippet}
    {#snippet parameterHeader()}
      {@render unitControls()}
      <button type="button" class="btn btn-secondary" onclick={() => void updateFabrication({ ...DEFAULT_PROJECT, id: project.id, name: project.name, location: project.location, outputMode: project.outputMode })}>Reset</button>
    {/snippet}
    {#snippet parameters()}{@render parameterControls()}{@render layerControls()}{/snippet}
    {#snippet preview()}{@render previewContent()}{/snippet}
    {#snippet dialogs()}{#if searchOpen && LocationDialog}<LocationDialog {project} presets={PRESETS} onChoose={choosePlace} onCoordinates={(lat, lon) => updateLocation({ lat, lon, label: "Custom coordinates" })} onClose={closeLocationDialog} />{/if}{/snippet}
  </AtommWorkbench>{:else}<main role="status">{atommLayoutFailed ? "The platform layout could not load. Reload to try again." : "Preparing terrain studio…"}</main>{/if}
{:else}
<AppShell class="app-shell">
  {#snippet header()}
    <div class="app-header">
      <Topbar class="topbar">
        {#snippet brand()}<Brand name="TopoStack" meta="Studio" />{/snippet}
        {#snippet navigation()}
          {@render projectControls()}
        {/snippet}
        {#snippet actions()}
          <div class="bar-meta">{#if project.outputMode === "engraving"}<span>{project.engravingContourCount} contours</span><span>1 engrave SVG</span><span>No cut paths</span>{:else}<span>{geometry.layers.length} layers</span><span>{fabricationPanelCount} cut panels</span><span>{shownLength(totalHeight)} {shownLengthUnit} tall</span>{/if}</div>
          <Button class="export-trigger" aria-label="Export" title="Export" aria-haspopup="dialog" onclick={(event: MouseEvent) => { if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus(); exportOpen = true; }}><Download size={18} aria-hidden="true" /><span class="export-trigger-label">Export</span></Button>
          <ThemeToggle {theme} class="theme-toggle" />
          <a class="about-link" href={`${base}/`} target="_blank" rel="noopener noreferrer" aria-label="TopoStack home and getting started (opens in a new tab)" title="TopoStack home and getting started (opens in a new tab)"><House size={18} aria-hidden="true" /></a>
        {/snippet}
      </Topbar>
      <ContextBar class="terrain-contextbar" section="Terrain" title={project.location.label.split(",")[0]} detail={project.location.label.split(",").slice(1).join(",") || "Selected coordinates"}>
        {#snippet actions()}
          {@render outputControls()}
        {/snippet}
      </ContextBar>
    </div>
  {/snippet}

  <Workspace class="workspace">
    {#snippet sidebar()}
    <Sidebar class="config-panel">
      <div class="panel-scroll">
        <div class="panel-intro">
          <span class="section-kicker panel-eyebrow">Project controls</span>
          <h1>{project.outputMode === "engraving" ? "Draw the landscape." : "Build the landscape."}</h1>
          <p>Work through the essentials, then open details only when you need them.</p>
          <div class="section-tools" aria-label="Section display controls">
            <button type="button" onclick={() => setAllSections(true)} disabled={CONFIG_SECTION_IDS.every((section) => openSections[section])}>Expand all</button>
            <button type="button" onclick={() => setAllSections(false)} disabled={CONFIG_SECTION_IDS.every((section) => !openSections[section])}>Collapse all</button>
          </div>
        </div>
        {@render setupControls()}

        {@render parameterControls()}
      </div>
      {@render generationControls()}
    </Sidebar>
    {/snippet}

    {@render previewContent()}
  </Workspace>
  <ExportDialog open={exportOpen} {project} blockedReason={exportBlockedBy} preparing={exportPhase === "preparing"} platformAvailable={platformExportAvailable} phase={exportPhase} title={exportTitle} detail={exportDetail} onDownload={(option) => void downloadProject(option)} onClose={() => exportOpen = false} />
  {#if searchOpen}{#if LocationDialog}<LocationDialog {project} presets={PRESETS} onChoose={choosePlace} onCoordinates={(lat, lon) => updateLocation({ lat, lon, label: "Custom coordinates" })} onClose={closeLocationDialog} />{/if}{/if}
</AppShell>

{/if}

