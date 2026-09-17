import { readFileSync } from "node:fs";
import noaaFixture from "../fixtures/noaa-erie-z11.json";
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createSyntheticSource, DEFAULT_PROJECT, generateGeometry, type GeometryIRV1 } from "@topostack/core";
import { theme } from "../lib/theme";
import { createSamplePreviewSource } from "../sample-preview";

const noaaArchive = vi.hoisted(() => ({ getHeader: vi.fn(), getMetadata: vi.fn(), getZxy: vi.fn() }));
vi.mock("../archive", async (importOriginal) => ({ ...await importOriginal<typeof import("../archive")>(), createArchive: vi.fn(() => noaaArchive) }));
const loadTerrainMock = vi.hoisted(() => vi.fn());
const loadVectorMarkingsMock = vi.hoisted(() => vi.fn());
const loadLakeAreasMock = vi.hoisted(() => vi.fn());
vi.mock("../data-provider", async (importOriginal) => ({ ...await importOriginal<typeof import("../data-provider")>(), loadTerrain: loadTerrainMock, loadVectorMarkings: loadVectorMarkingsMock, loadLakeAreas: loadLakeAreasMock }));
vi.mock("../storage", async (importOriginal) => ({ ...await importOriginal<typeof import("../storage")>(), loadProject: vi.fn(async () => undefined), saveProject: vi.fn(async () => undefined) }));
vi.mock("./atomm-bridge", () => ({ connectAtomm: vi.fn(() => () => undefined) }));
vi.mock("$app/navigation", () => ({ replaceState: (url: URL) => window.history.replaceState(window.history.state, "", url) }));
vi.mock("./ThreePreview.svelte", async () => ({ default: (await import("./TestPreview.svelte")).default }));

import App from "./App.svelte";

describe("TopoStack Svelte shell", () => {
  let component: ReturnType<typeof mount> | undefined;
  let initialPreview: GeometryIRV1;
  const stored = new Map<string, string>();
  const localStorageStub: Storage = {
    get length() { return stored.size; },
    clear: () => stored.clear(),
    getItem: (key) => stored.get(key) ?? null,
    key: (index) => [...stored.keys()][index] ?? null,
    removeItem: (key) => { stored.delete(key); },
    setItem: (key, value) => { stored.set(key, String(value)); },
  };
  // The app lazy-loads the 3D preview. Resolve the mocked module once up front
  // so the first in-test dynamic import cannot race mock registration and pull
  // in the real WebGL component.
  beforeAll(async () => {
    HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
    HTMLDialogElement.prototype.close ??= function () { this.open = false; this.dispatchEvent(new Event("close")); };
    // Match the page's precomputed Worker result. Clone it at each mount so
    // tests remain isolated without recalculating the same preview for every test.
    initialPreview = generateGeometry(DEFAULT_PROJECT, createSamplePreviewSource());
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorageStub });
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(target: Element): void { this.callback([{ target, contentRect: { width: 500, height: 500 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect(): void {}
      unobserve(): void {}
    } });
    await import("./ThreePreview.svelte");
  });
  afterEach(async () => { if (component) await unmount(component); component = undefined; loadTerrainMock.mockReset(); loadVectorMarkingsMock.mockReset(); loadLakeAreasMock.mockReset(); Object.values(noaaArchive).forEach((mock) => mock.mockReset()); theme.preference = "system"; localStorage.removeItem("topostack-theme"); localStorage.removeItem("topostack-menu-sections-v1"); delete window.atomm; });

  it("resets the entire saved project to Crater Lake defaults and supports Undo", async () => {
    const { loadProject, saveProject } = await import("../storage");
    const saved = { ...DEFAULT_PROJECT, name: "My mountain", widthMm: 450, outputMode: "engraving" as const,
      location: { lat: 46.85, lon: -121.76, label: "Mount Rainier", zoom: 12 }, showWater: false, verticalExaggeration: 5 };
    vi.mocked(loadProject).mockResolvedValueOnce(saved);
    vi.mocked(saveProject).mockClear();
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    const reset = () => target.querySelector<HTMLButtonElement>('button[aria-label="Reset project"]')!;
    await vi.waitFor(() => expect(reset().disabled).toBe(false));
    reset().click();
    await tick();
    const dialog = target.querySelector<HTMLDialogElement>(".reset-dialog")!;
    expect(dialog.open).toBe(true);
    expect(target.querySelector<HTMLInputElement>('[aria-label="Project name"]')?.value).toBe(saved.name);
    dialog.querySelector<HTMLButtonElement>("button")!.click();
    await tick();
    expect(target.querySelector(".reset-dialog")).toBeNull();
    expect(target.querySelector<HTMLInputElement>('[aria-label="Project name"]')?.value).toBe(saved.name);
    reset().click();
    await tick();
    [...target.querySelectorAll<HTMLButtonElement>(".reset-dialog button")].find((button) => button.textContent?.trim() === "Reset project")!.click();
    await vi.waitFor(() => expect(saveProject).toHaveBeenLastCalledWith(DEFAULT_PROJECT));
    expect(target.querySelector<HTMLInputElement>('[aria-label="Project name"]')?.value).toBe("Crater Lake");
    expect(target.querySelector('[aria-label="Layered relief"]')?.getAttribute("aria-checked")).toBe("true");
    await vi.waitFor(() => expect(target.textContent).toContain("Some lake depths are estimated rather than surveyed."));
    expect(loadTerrainMock).not.toHaveBeenCalled();
    target.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click();
    await vi.waitFor(() => expect(saveProject).toHaveBeenLastCalledWith(saved));
    target.querySelector<HTMLButtonElement>('button[aria-label="Redo"]')!.click();
    await vi.waitFor(() => expect(saveProject).toHaveBeenLastCalledWith(DEFAULT_PROJECT));
  });

  it("discards terrain generation that finishes after resetting the project", async () => {
    const { saveProject } = await import("../storage");
    let finish: ((value: unknown) => void) | undefined;
    loadTerrainMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    const reset = () => target.querySelector<HTMLButtonElement>('button[aria-label="Reset project"]')!;
    await vi.waitFor(() => expect(reset().disabled).toBe(false));
    target.querySelector<HTMLButtonElement>(".generate-button")!.click();
    await vi.waitFor(() => expect(finish).toBeDefined());
    reset().click();
    await tick();
    [...target.querySelectorAll<HTMLButtonElement>(".reset-dialog button")].find((button) => button.textContent?.trim() === "Reset project")!.click();
    await tick();
    finish!({ source: createSyntheticSource(DEFAULT_PROJECT, 32), fallback: true });
    await vi.waitFor(() => expect(saveProject).toHaveBeenLastCalledWith(DEFAULT_PROJECT));
    expect(target.querySelector(".status-line")?.textContent).toContain("Project reset to Crater Lake defaults");
    expect(target.textContent).not.toContain("Sample terrain generated");
  });

  it("deduplicates repeated survey-gap warnings without hiding distinct warnings", async () => {
    const preview = structuredClone(initialPreview);
    const gap = { code: "BATHYMETRY_FALLBACK" as const, message: "A lake has incomplete survey coverage." };
    preview.warnings = [gap, { ...gap }, { code: "LOW_RELIEF", message: "Very little elevation change." }];
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: preview } });
    await tick();
    expect(target.querySelectorAll(".preview-warning")).toHaveLength(2);
    expect([...target.querySelectorAll(".preview-warning")].filter((warning) => warning.textContent?.includes(gap.message))).toHaveLength(1);
    const dismiss = [...target.querySelectorAll<HTMLButtonElement>(".warning-dismiss")].find((button) => button.getAttribute("aria-label")?.includes(gap.message))!;
    dismiss.click();
    await tick();
    expect(target.textContent).not.toContain(gap.message);
    expect(target.textContent).toContain("Very little elevation change.");
  });

  it("dismisses preview warnings without clearing export restrictions and restores warnings for fresh terrain", async () => {
    loadTerrainMock.mockResolvedValue({ source: createSyntheticSource(DEFAULT_PROJECT, 32), fallback: true });
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const dismissAll = async (): Promise<void> => {
      for (let count = 0; count < 20; count++) {
        const button = target.querySelector<HTMLButtonElement>(".warning-dismiss");
        if (!button) break;
        button.click();
        await tick();
      }
      expect(target.querySelector(".warning-stack")).toBeNull();
    };
    expect(target.querySelector(".warning-stack")).not.toBeNull();
    await dismissAll();
    const name = target.querySelector<HTMLInputElement>('input[aria-label="Project name"]')!;
    name.value = "Quiet preview";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(target.querySelector(".warning-stack")).toBeNull();
    expect(target.querySelector(".context-export-status")?.textContent).toContain("Generate before export");
    for (let generation = 1; generation <= 2; generation++) {
      target.querySelector<HTMLButtonElement>(".generate-button")!.click();
      await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledTimes(generation));
      await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Sample terrain generated"));
      expect(target.querySelector(".warning-stack")).not.toBeNull();
      await dismissAll();
      expect(target.querySelector(".context-export-status")?.textContent).toContain("Generate before export");
    }
  });

  it("fits lake depth from the clipping warning and restores manual depth from the preview", async () => {
    const source = createSyntheticSource(DEFAULT_PROJECT, 32);
    const values = new Float32Array(32 * 32);
    const depthsM = new Float32Array(32 * 32);
    for (let row = 0; row < 32; row++) for (let column = 0; column < 32; column++) {
      const x = (column / 31 - 0.5) * DEFAULT_PROJECT.widthMm;
      const y = (row / 31 - 0.5) * DEFAULT_PROJECT.heightMm;
      const inside = Math.abs(x) < 40 && Math.abs(y) < 40;
      values[row * 32 + column] = inside ? 180 : 180 + Math.hypot(x, y);
      depthsM[row * 32 + column] = inside ? 600 * (1 - Math.max(Math.abs(x), Math.abs(y)) / 40) : NaN;
    }
    loadTerrainMock.mockResolvedValue({ source: {
      ...source, sourceKind: "real", vectorStatus: "available", lakeDataStatus: "available", bathymetryStatus: "available", markings: [],
      elevation: { width: 32, height: 32, values, min: 180, max: Math.max(...values) },
      waterAreas: [{ id: "test-lake", kind: "lake", name: "Deep test lake",
        polygon: { outer: [{ x: -40, y: -40 }, { x: 40, y: -40 }, { x: 40, y: 40 }, { x: -40, y: 40 }, { x: -40, y: -40 }], holes: [] },
        bathymetry: { width: 32, height: 32, depthsM },
      }],
    }, fallback: false });
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Limit depth layers"]')!.click();
    await tick();
    const allowance = target.querySelector<HTMLInputElement>('input[aria-label="Maximum depth layers"]')!;
    allowance.value = "6";
    allowance.dispatchEvent(new Event("input", { bubbles: true }));
    target.querySelector<HTMLButtonElement>(".generate-button")!.click();
    const fitButton = () => [...target.querySelectorAll<HTMLButtonElement>(".preview-warning button")].find((button) => button.textContent?.trim() === "Fit depth");
    await vi.waitFor(() => expect(fitButton()).toBeDefined());
    fitButton()!.click();
    const fitSwitch = () => target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Fit lake depth to available layers"]')!;
    await vi.waitFor(() => expect(fitSwitch().getAttribute("aria-checked")).toBe("true"));
    await vi.waitFor(() => expect(target.textContent).toContain("% of requested depth"));
    expect(fitButton()).toBeUndefined();
    expect(target.textContent).not.toContain("so its floor is flattened");
    [...target.querySelectorAll<HTMLButtonElement>(".warning-action")].find((button) => button.textContent?.trim() === "Use manual depth")!.click();
    await vi.waitFor(() => expect(fitSwitch().getAttribute("aria-checked")).toBe("false"));
    await vi.waitFor(() => expect(fitButton()).toBeDefined());
    expect(target.textContent).not.toContain("% of requested depth");
    expect(loadTerrainMock).toHaveBeenCalledTimes(1);
    expect(loadLakeAreasMock).not.toHaveBeenCalled();

    // Returning to automatic coverage restores the full floor without fetching terrain.
    const limitedLayers = Number(target.querySelector<HTMLInputElement>('.layer-range')!.max) + 1;
    target.querySelector<HTMLButtonElement>('[aria-label="Limit depth layers"]')!.click();
    await vi.waitFor(() => expect(target.querySelector<HTMLInputElement>('.layer-range')!.max).not.toBe(String(limitedLayers - 1)));
    await vi.waitFor(() => expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("false"));
    expect(Number(target.querySelector<HTMLInputElement>('.layer-range')!.max) + 1).toBeGreaterThan(limitedLayers);
    expect(target.querySelector('[aria-label="Maximum depth layers"]')).toBeNull();
    expect(fitButton()).toBeUndefined();
    target.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click();
    await vi.waitFor(() => expect(fitButton()).toBeDefined());
    expect(target.querySelector<HTMLInputElement>('[aria-label="Maximum depth layers"]')!.value).toBe("6");
    expect(loadTerrainMock).toHaveBeenCalledTimes(1);

    // Keeping the preference enabled must not show a notice for a shallower lake.
    fitButton()!.click();
    await vi.waitFor(() => expect(target.textContent).toContain("Lake depth fitting is on."));
    await vi.waitFor(() => expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("false"));
    depthsM.fill(1);
    target.querySelector<HTMLButtonElement>(".generate-button")!.click();
    await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("false"));
    expect(fitSwitch().getAttribute("aria-checked")).toBe("true");
    expect(target.textContent).not.toContain("Lake depth fitting is on.");
    expect(target.textContent).not.toContain("% of requested depth");
    expect([...target.querySelectorAll(".warning-action")].some((button) => button.textContent?.trim() === "Use manual depth")).toBe(false);
    expect(fitButton()).toBeUndefined();
  });

  it("hides the fitting notice for a restored preference without fitted lakes and saves manual depth", async () => {
    const { loadProject, saveProject } = await import("../storage");
    vi.mocked(saveProject).mockClear();
    vi.mocked(loadProject).mockResolvedValueOnce({ ...DEFAULT_PROJECT, fitLakeDepth: true, waterDepthLayerLimit: 6 });
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    const manualButton = () => [...target.querySelectorAll<HTMLButtonElement>(".warning-action")].find((button) => button.textContent?.trim() === "Use manual depth");
    await vi.waitFor(() => expect(target.textContent).toContain("Local project restored"));
    expect(target.textContent).not.toContain("Lake depth fitting is on.");
    expect(manualButton()).toBeUndefined();
    const fitSwitch = target.querySelector<HTMLButtonElement>('[aria-label="Fit lake depth to available layers"]')!;
    expect(fitSwitch.getAttribute("aria-checked")).toBe("true");
    fitSwitch.click();
    await vi.waitFor(() => expect(target.querySelector('[aria-label="Fit lake depth to available layers"]')?.getAttribute("aria-checked")).toBe("false"));
    await vi.waitFor(() => expect(saveProject).toHaveBeenLastCalledWith(expect.objectContaining({ fitLakeDepth: false })));
    expect(manualButton()).toBeUndefined();
    const saved = vi.mocked(saveProject).mock.lastCall![0];
    await unmount(component!);
    component = undefined;
    vi.mocked(loadProject).mockResolvedValueOnce(saved);
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await vi.waitFor(() => expect(target.textContent).toContain("Local project restored"));
    expect(target.querySelector('[aria-label="Fit lake depth to available layers"]')?.getAttribute("aria-checked")).toBe("false");
    expect(manualButton()).toBeUndefined();
  });

  it("shows the predicted-depth notice alongside Fit depth and allows dismissal", async () => {
    const preview = structuredClone(initialPreview);
    const prediction = "Some lake depths are estimated rather than surveyed.";
    preview.warnings = [
      { code: "LABEL_OMITTED", message: "Some labels do not fit." },
      { code: "BATHYMETRY_FALLBACK", message: "Partial survey coverage." },
      { code: "LAKE_DEPTH_PREDICTED", message: prediction },
      { code: "WATER_DEPTH_CLAMPED", message: "The lake is too deep for the stack.", action: "fit-lake-depth" },
    ];
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: preview } });
    await tick();
    expect(target.querySelectorAll(".preview-warning")).toHaveLength(2);
    expect(target.querySelector(".preview-warning .warning-action")?.textContent?.trim()).toBe("Fit depth");
    expect(target.querySelector(".warning-stack")?.textContent).toContain(prediction);
    expect(target.querySelector<HTMLAnchorElement>('.warning-stack a[href$="/guides/how-lake-depths-work"]')?.target).toBe("_blank");
    target.querySelector<HTMLButtonElement>(`button[aria-label="Dismiss warning: ${prediction}"]`)!.click();
    await tick();
    expect(target.querySelector(".warning-stack")?.textContent).not.toContain(prediction);
    expect(preview.warnings.some((warning) => warning.code === "LAKE_DEPTH_PREDICTED")).toBe(true);
  });

  it("keeps the fit action visible when other warnings fill the preview", async () => {
    const preview = structuredClone(initialPreview);
    preview.warnings = [
      { code: "BATHYMETRY_FALLBACK", message: "Partial survey coverage." },
      { code: "LABEL_OMITTED", message: "Some labels do not fit." },
      { code: "WATER_DEPTH_CLAMPED", message: "The lake is too deep for the stack.", action: "fit-lake-depth" },
    ];
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: preview } });
    await tick();
    expect(target.querySelectorAll(".preview-warning")).toHaveLength(2);
    expect(target.querySelector(".preview-warning .warning-action")?.textContent?.trim()).toBe("Fit depth");
  });

  it("opens a directory lake after restoring settings and consumes the place link once", async () => {
    const { loadProject, saveProject } = await import("../storage");
    vi.mocked(saveProject).mockClear();
    vi.mocked(loadProject).mockResolvedValueOnce({ ...DEFAULT_PROJECT, name: "Saved mountain", materialThicknessMm: 5, outputMode: "engraving", showWaterDepth: false });
    window.history.replaceState(null, "", "/studio?lake=Lake%20Tahoe&bounds=-120.2,38.9,-119.8,39.3");
    try {
      const target = document.createElement("div");
      component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
      await vi.waitFor(() => expect(target.textContent).toContain("Lake selected from the depth directory"));
      expect(target.querySelector<HTMLInputElement>('[aria-label="Project name"]')?.value).toBe("Lake Tahoe");
      expect(target.querySelector('[aria-label="Water depth"]')?.getAttribute("aria-checked")).toBe("true");
      expect(window.location.search).toBe("");
      await vi.waitFor(() => expect(saveProject).toHaveBeenLastCalledWith(expect.objectContaining({
        name: "Lake Tahoe", materialThicknessMm: 5, outputMode: "stack", showWaterDepth: true,
        location: expect.objectContaining({ label: "Lake Tahoe", lon: -120 }),
      })));
      expect(vi.mocked(saveProject).mock.lastCall![0].location.lat).toBeCloseTo(39.1);
      expect(loadTerrainMock).not.toHaveBeenCalled();
      expect(target.querySelector(".context-export-status")?.textContent).toContain("Generate before export");
    } finally { window.history.replaceState(null, "", "/"); }
  });

  it("edits and undoes the project name and switches preview modes", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const name = target.querySelector<HTMLInputElement>('input[aria-label="Project name"]')!;
    name.value = "Alpine study";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(name.value).toBe("Alpine study");
    target.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click();
    await tick();
    expect(name.value).toBe(DEFAULT_PROJECT.name);
    [...target.querySelectorAll("button")].find((button) => button.textContent?.includes("Cut layers"))!.click();
    await vi.waitFor(() => expect(target.querySelector('svg[aria-label^="Cut preview for layer"]')).not.toBeNull());
    await vi.waitFor(() => expect(target.querySelector('[data-marking-kind="road"]')).not.toBeNull());
    expect(target.querySelector(".layer-heading")?.textContent).toMatch(/Layer \d+ of 12/);
  });

  it("refreshes the preview and export state when undoing and redoing a fabrication change", async () => {
    const source = { ...createSyntheticSource(DEFAULT_PROJECT, 32), sourceKind: "real" as const, vectorStatus: "available" as const };
    loadTerrainMock.mockResolvedValue({ source, fallback: false });
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    target.querySelector<HTMLButtonElement>(".generate-button")!.click();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));
    const exportStatus = () => target.querySelector(".context-export-status")?.textContent;
    expect(exportStatus()).toContain("Ready to export");
    const stackSummary = () => target.querySelector(".bar-meta")?.textContent;
    const initialStack = stackSummary();

    const material = target.querySelector<HTMLInputElement>('input[aria-label="Material"]')!;
    const originalThickness = material.value;
    material.value = String(Number(originalThickness) * 2);
    material.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Fabrication geometry updated"));
    await vi.waitFor(() => expect(stackSummary()).not.toBe(initialStack));
    expect(exportStatus()).toContain("Ready to export");

    target.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click();
    await vi.waitFor(() => expect(target.querySelector<HTMLInputElement>('input[aria-label="Material"]')?.value).toBe(originalThickness));
    await vi.waitFor(() => expect(stackSummary()).toBe(initialStack));
    await vi.waitFor(() => expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("false"));
    expect(exportStatus()).toContain("Ready to export");

    target.querySelector<HTMLButtonElement>('button[aria-label="Redo"]')!.click();
    await vi.waitFor(() => expect(stackSummary()).not.toBe(initialStack));
    await vi.waitFor(() => expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("false"));
    expect(exportStatus()).toContain("Ready to export");
    expect(loadTerrainMock).toHaveBeenCalledOnce();
  });

  it("restores map-detail markings when undoing a detail toggle", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const stage = target.querySelector<HTMLElement>(".preview-stage")!;
    const initialRoads = stage.dataset.roadMarkings;
    expect(Number(initialRoads)).toBeGreaterThan(0);
    const roads = target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Roads"]')!;
    roads.click();
    await vi.waitFor(() => expect(stage.dataset.roadMarkings).toBe("0"));
    target.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click();
    await vi.waitFor(() => expect(roads.getAttribute("aria-checked")).toBe("true"));
    await vi.waitFor(() => expect(stage.dataset.roadMarkings).toBe(initialRoads));
    expect(target.querySelector(".status-line")?.textContent).toMatch(/updated/i);
  });

  it("asks for regeneration instead of refreshing when undo restores a different map area", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    [...target.querySelectorAll<HTMLButtonElement>(".preset-row button")].find((button) => button.textContent === "Grand Teton and Jenny Lake")!.click();
    await tick();
    expect(target.querySelector(".status-line")?.textContent).toContain("Map area changed");
    target.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click();
    await tick();
    expect(target.querySelector(".status-line")?.textContent).not.toContain("Map area changed");
    target.querySelector<HTMLButtonElement>('button[aria-label="Redo"]')!.click();
    await tick();
    expect(target.querySelector(".status-line")?.textContent).toContain("Map area changed");
    expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("false");
  });

  it("keeps autosave working and reports the problem when restoring a saved project fails", async () => {
    const { loadProject, saveProject } = await import("../storage");
    vi.mocked(saveProject).mockClear();
    vi.mocked(loadProject).mockRejectedValueOnce(new Error("IndexedDB blocked"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const target = document.createElement("div");
      component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
      await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Saved project could not be restored"));
      const name = target.querySelector<HTMLInputElement>('input[aria-label="Project name"]')!;
      name.value = "Still saved";
      name.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.waitFor(() => expect(saveProject).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Still saved" })));
    } finally { errors.mockRestore(); }
  });

  it("flushes a pending autosave when the tab is closing or hidden", async () => {
    const { saveProject } = await import("../storage");
    vi.mocked(saveProject).mockClear();
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    // Autosave only starts once the saved project has been restored.
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalled(), { timeout: 2_000 });
    vi.mocked(saveProject).mockClear();
    const name = target.querySelector<HTMLInputElement>('input[aria-label="Project name"]')!;
    name.value = "Closed mid-edit";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    // Still inside the debounce: only the flush can explain a write here.
    expect(saveProject).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pagehide"));
    expect(saveProject).toHaveBeenCalledWith(expect.objectContaining({ name: "Closed mid-edit" }));
    try {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
      // The same snapshot is written once, however often the tab is hidden.
      expect(saveProject).toHaveBeenCalledOnce();
    } finally { Object.defineProperty(document, "hidden", { configurable: true, value: false }); }
  });

  it("discards a generation started before the saved project finished restoring", async () => {
    const { loadProject } = await import("../storage");
    let finishRestore: ((project: typeof DEFAULT_PROJECT) => void) | undefined;
    vi.mocked(loadProject).mockImplementationOnce(() => new Promise((resolve) => { finishRestore = resolve; }));
    loadTerrainMock.mockImplementation((_project, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Canceled", "AbortError")), { once: true })));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    target.querySelector<HTMLButtonElement>(".generate-button")!.click();
    await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledOnce());
    finishRestore!({ ...DEFAULT_PROJECT, name: "Restored ridge" });
    await vi.waitFor(() => expect(target.textContent).toContain("Local project restored"));
    expect(target.querySelector<HTMLInputElement>('input[aria-label="Project name"]')?.value).toBe("Restored ridge");
    expect(target.querySelector(".generate-button")?.textContent).not.toContain("Cancel generation");
    expect(target.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')?.disabled).toBe(true);
  });

  it("switches to a flat engraving workflow with dedicated controls and preview", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const engraving = target.querySelector<HTMLButtonElement>('button[role="radio"][aria-label="Flat engraving"]')!;
    engraving.click();
    await vi.waitFor(() => expect(engraving.getAttribute("aria-checked")).toBe("true"));
    await vi.waitFor(() => expect(target.querySelector('svg[aria-label="Flat engraving preview"]')).not.toBeNull());
    expect(target.querySelector<HTMLInputElement>('input[aria-label="Contour density"]')?.value).toBe("12");
    expect(target.querySelector('button[role="switch"][aria-label="Engraved border"]')).not.toBeNull();
    expect(target.querySelector('button[role="switch"][aria-label="Water depth"]')).toBeNull();
    const waterFill = target.querySelector<HTMLElement>('div[aria-label="Water fill pattern"]')!;
    const noWaterFill = [...waterFill.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find((button) => button.textContent === "None")!;
    const rippleFill = [...waterFill.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find((button) => button.textContent === "Ripples")!;
    expect(noWaterFill.getAttribute("aria-checked")).toBe("true");
    rippleFill.click();
    await vi.waitFor(() => expect(rippleFill.getAttribute("aria-checked")).toBe("true"));
    await vi.waitFor(() => expect(target.querySelector('[data-water-pattern="ripples"]')).not.toBeNull());
    expect(target.querySelector(".layer-dock")).toBeNull();
    expect(target.querySelector(".bar-meta")?.textContent).toContain("No cut paths");
    const viewport = target.querySelector<HTMLElement>("[data-svg-viewport]")!;
    const artwork = target.querySelector<SVGSVGElement>('svg[aria-label="Flat engraving preview"]')!;
    const initialViewBox = artwork.getAttribute("viewBox");
    expect(viewport.dataset.zoom).toBe("1.00");
    target.querySelector<HTMLButtonElement>('button[aria-label="Zoom in"]')!.click();
    await vi.waitFor(() => expect(viewport.dataset.zoom).toBe("1.50"));
    expect(viewport.dataset.rendering).toBe("preview");
    expect(artwork.getAttribute("viewBox")).toBe(initialViewBox);
    await vi.waitFor(() => expect(viewport.dataset.rendering).toBe("sharp"));
    expect(viewport.dataset.renderZoom).toBe("1.50");
    expect(artwork.getAttribute("viewBox")).not.toBe(initialViewBox);
    expect(Number(artwork.getAttribute("viewBox")!.split(" ")[2])).toBeLessThan(Number(initialViewBox!.split(" ")[2]));
    expect(target.querySelector(".svg-zoom-value")?.textContent).toBe("150%");
    target.querySelector<HTMLButtonElement>('button[aria-label="Reset engraving view"]')!.click();
    await vi.waitFor(() => expect(viewport.dataset.zoom).toBe("1.00"));
    expect(artwork.getAttribute("viewBox")).toBe(initialViewBox);
    viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -80, bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(Number(viewport.dataset.zoom)).toBeGreaterThan(1));
    expect(viewport.dataset.rendering).toBe("preview");
    expect(viewport.dataset.renderZoom).toBe("1.00");
    expect(artwork.getAttribute("viewBox")).toBe(initialViewBox);
    expect(target.querySelector<HTMLElement>(".svg-canvas")?.style.transform).toMatch(/scale\(1\./);
    await vi.waitFor(() => expect(viewport.dataset.rendering).toBe("sharp"));
    expect(viewport.dataset.renderZoom).toBe(viewport.dataset.zoom);
    expect(artwork.getAttribute("viewBox")).not.toBe(initialViewBox);
    expect(target.querySelector<HTMLElement>(".svg-canvas")?.style.transform).toContain("scale(1)");
    const settledViewBox = artwork.getAttribute("viewBox");
    viewport.setPointerCapture = vi.fn();
    viewport.hasPointerCapture = vi.fn(() => true);
    viewport.releasePointerCapture = vi.fn();
    const pointerEvent = (type: string, clientX: number, clientY: number): MouseEvent => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
      Object.defineProperty(event, "pointerId", { value: 1 });
      return event;
    };
    viewport.dispatchEvent(pointerEvent("pointerdown", 100, 100));
    viewport.dispatchEvent(pointerEvent("pointermove", 110, 108));
    const panLayer = target.querySelector<HTMLElement>(".svg-pan-layer")!;
    await vi.waitFor(() => {
      const offset = panLayer.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
      expect(Number(offset?.[1])).toBeCloseTo(10);
      expect(Number(offset?.[2])).toBeCloseTo(8);
    });
    expect(artwork.getAttribute("viewBox")).toBe(settledViewBox);
    viewport.dispatchEvent(pointerEvent("pointerup", 110, 108));
    await vi.waitFor(() => expect(panLayer.style.transform).toBe("translate3d(0, 0, 0)"));
    expect(artwork.getAttribute("viewBox")).toBe(settledViewBox);
    expect(target.querySelector<HTMLElement>(".svg-canvas")?.style.transform).not.toContain("translate3d(0px, 0px");
  });

  it("applies linework presets and custom trail patterns to the engraving preview", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const bold = [...target.querySelectorAll<HTMLButtonElement>('.line-presets button[role="radio"]')].find((button) => button.textContent?.includes("Bold"))!;
    bold.click();
    await vi.waitFor(() => expect(bold.getAttribute("aria-checked")).toBe("true"));
    target.querySelector<HTMLButtonElement>('button[role="radio"][aria-label="Flat engraving"]')!.click();
    await vi.waitFor(() => expect(target.querySelector('svg[aria-label="Flat engraving preview"]')).not.toBeNull());
    await vi.waitFor(() => expect(target.querySelector('.engraving-contours path:not(.index-contour)')?.getAttribute("stroke-width")).toBe("0.24"));
    target.querySelector<HTMLButtonElement>(".linework-customize")!.click();
    await tick();
    const dotted = [...target.querySelectorAll<HTMLButtonElement>('.trail-pattern-options button[role="radio"]')].find((button) => button.textContent?.includes("Dotted"))!;
    dotted.click();
    await vi.waitFor(() => expect(dotted.getAttribute("aria-checked")).toBe("true"));
    await vi.waitFor(() => expect(target.querySelector('[data-transportation-class="trail"] path')?.getAttribute("stroke-dasharray")).toMatch(/^0\.01 /));
    const outlined = [...target.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find((button) => button.textContent?.includes("Outlined"))!;
    outlined.click();
    await vi.waitFor(() => expect(outlined.getAttribute("aria-checked")).toBe("true"));
    expect(target.querySelector('input[aria-label="Major road outline spacing"]')).not.toBeNull();
    const square = [...target.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find((button) => button.textContent?.includes("Square"))!;
    square.click();
    await vi.waitFor(() => expect(target.querySelector('[data-transportation-class="major-road"] path')?.getAttribute("stroke-linecap")).toBe("square"));
  });

  it("lays out fabrication controls in full-width rows with a compact position pair", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Fabrication settings"))!.click();
    await tick();
    const fields = target.querySelector<HTMLElement>(".advanced-fields")!;
    expect(fields.querySelectorAll('.toggle-stack button[role="switch"]')).toHaveLength(2);
    // Glue margin, laser kerf, minimum feature, and the two work-area fields.
    expect(fields.querySelectorAll(".field-stack > .field-row")).toHaveLength(5);
    // Text engraving and the elevation label position now sit beside what they
    // affect in Map details rather than in the fabrication panel.
    expect(fields.querySelector(".swatch-options")).toBeNull();
    expect(target.querySelectorAll('.swatch-options[aria-label="Engraving font"] button[role="radio"]')).toHaveLength(3);
    expect(target.querySelectorAll('input[aria-label="Label X"]')).toHaveLength(1);
  });

  it("reports the sheet grid a machine work area implies", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Fabrication settings"))!.click();
    await tick();
    const fields = target.querySelector<HTMLElement>(".advanced-fields")!;
    // No work area: the model is cut whole and there is nothing to label.
    expect(fields.querySelector(".seam-summary")?.textContent).toMatch(/one piece/i);
    expect([...fields.querySelectorAll('button[role="switch"]')].some((button) => button.getAttribute("aria-label") === "Assembly labels")).toBe(false);

    const width = target.querySelector<HTMLInputElement>('input[aria-label="Work area width"]')!;
    const height = target.querySelector<HTMLInputElement>('input[aria-label="Work area height"]')!;
    for (const [input, value] of [[width, "160"], [height, "120"]] as const) {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
      await tick();
    }
    await vi.waitFor(() => expect(target.querySelector(".seam-summary")?.textContent).toContain("2 × 2 sheets per layer"));
    expect([...target.querySelectorAll('button[role="switch"]')].some((button) => button.getAttribute("aria-label") === "Assembly labels")).toBe(true);
  });

  it("changes engraving font and exact physical text size without refetching terrain", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const stencil = [...target.querySelectorAll<HTMLButtonElement>('.swatch-options[aria-label="Engraving font"] button[role="radio"]')].find((button) => button.textContent?.includes("Stencil"))!;
    stencil.click();
    await vi.waitFor(() => expect(stencil.getAttribute("aria-checked")).toBe("true"));
    const size = target.querySelector<HTMLInputElement>('input[aria-label="Text size"]')!;
    size.value = "5";
    size.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(target.querySelector<HTMLInputElement>('input[aria-label="Text size slider"]')?.value).toBe("5"));
    expect(loadTerrainMock).not.toHaveBeenCalled();
  });

  it("customizes north-arrow design, physical size, and anchored placement without refetching terrain", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const designs = target.querySelectorAll<HTMLButtonElement>('.swatch-options[aria-label="North arrow design"] button[role="radio"]');
    expect(designs).toHaveLength(3);
    const mariner = [...designs].find((button) => button.textContent?.includes("Mariner"))!;
    mariner.click();
    await vi.waitFor(() => expect(mariner.getAttribute("aria-checked")).toBe("true"));
    const size = target.querySelector<HTMLInputElement>('input[aria-label="North arrow size"]')!;
    size.value = "30";
    size.dispatchEvent(new Event("input", { bubbles: true }));
    const topLeft = target.querySelector<HTMLButtonElement>('.north-arrow-anchor-grid button[aria-label="Top left"]')!;
    topLeft.click();
    const offsetX = target.querySelector<HTMLInputElement>('input[aria-label="North arrow offset X"]')!;
    offsetX.value = "15";
    offsetX.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(topLeft.getAttribute("aria-checked")).toBe("true"));
    await vi.waitFor(() => expect(target.querySelector<HTMLInputElement>('input[aria-label="North arrow size slider"]')?.value).toBe("30"));
    expect(offsetX.value).toBe("15");
    // Preview refreshes trail rapid edits, so wait for the coalesced rebuild.
    await vi.waitFor(() => expect(Number(target.querySelector<HTMLElement>(".preview-stage")?.dataset.northMarkings)).toBeGreaterThan(10));
    expect(loadTerrainMock).not.toHaveBeenCalled();
  });

  it("collapses, expands, and remembers configuration sections", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();

    const sections = [...target.querySelectorAll<HTMLButtonElement>(".section-disclosure")];
    expect(sections).toHaveLength(7);
    expect(sections[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(sections.slice(1).every((section) => section.getAttribute("aria-expanded") === "false")).toBe(true);
    expect(target.querySelector<HTMLElement>("#section-size")?.hidden).toBe(true);

    [...target.querySelectorAll<HTMLButtonElement>(".section-tools button")].find((button) => button.textContent === "Expand all")!.click();
    await tick();
    expect(sections.every((section) => section.getAttribute("aria-expanded") === "true")).toBe(true);
    expect(target.querySelector<HTMLElement>("#section-size")?.hidden).toBe(false);

    sections.find((section) => section.textContent?.includes("Map details"))!.click();
    await tick();
    const saved = JSON.parse(localStorage.getItem("topostack-menu-sections-v1") ?? "{}") as Record<string, boolean>;
    expect(saved.details).toBe(false);
    expect(saved.size).toBe(true);
  });

  it("updates vertical exaggeration immediately from retained terrain, including undo and redo", async () => {
    const source = { ...createSyntheticSource(DEFAULT_PROJECT, 32), sourceKind: "real" as const };
    loadTerrainMock.mockResolvedValue({ source, fallback: false });
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    target.querySelector<HTMLButtonElement>(".generate-button")!.click();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));
    const initialLayers = target.querySelector(".layer-heading")?.textContent;
    const exaggeration = target.querySelector<HTMLInputElement>('input[aria-label="Vertical exaggeration"]')!;
    exaggeration.value = "4";
    exaggeration.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(target.querySelector(".layer-heading")?.textContent).not.toBe(initialLayers));
    await vi.waitFor(() => expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("false"));
    const updatedLayers = target.querySelector(".layer-heading")?.textContent;
    expect(loadTerrainMock).toHaveBeenCalledOnce();
    expect(target.querySelector(".vertical-exaggeration-heading .terrain-data-badge")?.textContent).toBe("Updates automatically");
    target.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click();
    await vi.waitFor(() => expect(target.querySelector(".layer-heading")?.textContent).toBe(initialLayers));
    target.querySelector<HTMLButtonElement>('button[aria-label="Redo"]')!.click();
    await vi.waitFor(() => expect(target.querySelector(".layer-heading")?.textContent).toBe(updatedLayers));
    expect(loadTerrainMock).toHaveBeenCalledOnce();
  });

  it("explains automatic sidebar updates and flags a manually selected map area", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const note = target.querySelector<HTMLElement>(".terrain-data-note")!;
    expect(note.textContent).toContain("Sidebar settings update the preview automatically.");
    [...target.querySelectorAll<HTMLButtonElement>(".preset-row button")].find((button) => button.textContent === "Grand Teton and Jenny Lake")!.click();
    await tick();
    expect(note.textContent).toContain("Terrain data is from the previous map area.");
    expect(target.querySelector(".status-line")?.textContent).toContain("Map area changed · generate terrain data before export");
  });

  it("applies and persists an explicit color scheme", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const toggle = target.querySelector<HTMLButtonElement>('button[data-theme-preference="system"]')!;
    expect(toggle.getAttribute("aria-label")).toBe("Colour scheme: System");
    toggle.click();
    await tick();
    expect(toggle.dataset.themePreference).toBe("light");
    toggle.click();
    await tick();
    expect(toggle.dataset.themePreference).toBe("dark");
    expect(toggle.getAttribute("aria-label")).toBe("Colour scheme: Dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("topostack-theme")).toBe("dark");
    expect(document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')).not.toBeNull();
  });

  it("automatically fetches the new map area after debounced cut aspect-ratio edits", async () => {
    loadTerrainMock.mockImplementation(async (config: typeof DEFAULT_PROJECT) => ({ source: createSyntheticSource(config, 32), fallback: true }));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const width = target.querySelector<HTMLInputElement>('input[type="number"]')!;
    expect(width.max).toBe("10000");
    width.value = "1200";
    width.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("true"));
    expect(target.querySelector(".preview-readout")?.textContent).toContain("1200 × 200 mm");
    await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("false"));
    expect(loadVectorMarkingsMock).not.toHaveBeenCalled();
    expect(loadLakeAreasMock).not.toHaveBeenCalled();
  });

  it("converts units and automatically refreshes aspect-ratio edits", async () => {
    loadTerrainMock.mockImplementation(async (config: typeof DEFAULT_PROJECT) => ({ source: createSyntheticSource(config, 32), fallback: true }));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const width = target.querySelector<HTMLInputElement>('input[type="number"]')!;
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Imperial"))!.click();
    await vi.waitFor(() => expect(target.querySelector(".preview-readout")?.textContent).toContain("11.811 × 7.874 in"));
    expect(width.value).toBe("11.811");
    expect(width.closest(".field-row")?.textContent).toContain("in");
    expect(target.querySelector(".layer-heading")?.textContent).toContain("ft");
    width.value = "10";
    width.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("true"));
    expect(target.querySelector(".preview-readout")?.textContent).toContain("10 × 7.874 in");
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Metric"))!.click();
    await vi.waitFor(() => expect(target.querySelector(".preview-readout")?.textContent).toContain("254 × 200 mm"));
    expect(width.value).toBe("254");
    await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("false"));
    expect(loadVectorMarkingsMock).not.toHaveBeenCalled();
    expect(loadLakeAreasMock).not.toHaveBeenCalled();
  });

  it("cancels an in-flight terrain request and reports the outcome", async () => {
    loadTerrainMock.mockImplementation((_project, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Canceled", "AbortError")), { once: true })));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const generate = [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!;
    generate.click();
    await tick();
    expect(generate.textContent).toContain("Cancel generation");
    expect(target.querySelector(".generation-step")?.textContent).toBe("Step 1 of 3");
    const onStage = loadTerrainMock.mock.calls.at(-1)![2];
    onStage("preparing");
    await tick();
    expect(target.querySelector(".generation-step")?.textContent).toBe("Step 2 of 3");
    expect(target.querySelector(".generation-overlay")?.textContent).toContain("Preparing terrain and lake depths");
    generate.click();
    await tick(); await Promise.resolve();
    expect(target.querySelector(".status-line")?.textContent).toContain("Generation canceled");
    expect(target.querySelector(".generation-overlay")).toBeNull();
    onStage("fetching"); // Late progress must not replace the cancellation message.
    await tick();
    expect(target.querySelector(".status-line")?.textContent).toContain("Generation canceled");
  });

  it("preserves cosmetic edits made while terrain generation is in flight", async () => {
    let finishTerrain: (() => void) | undefined;
    loadTerrainMock.mockImplementation((requested: typeof DEFAULT_PROJECT) => new Promise((resolve) => {
      finishTerrain = () => resolve({
        source: {
          ...createSyntheticSource(requested, 32),
          sourceKind: "real" as const,
          vectorStatus: "available" as const,
        },
        fallback: false,
      });
    }));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const generate = [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!;
    generate.click();
    await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledOnce());

    const name = target.querySelector<HTMLInputElement>('input[aria-label="Project name"]')!;
    name.value = "Renamed while loading";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    const exploded = target.querySelector<HTMLInputElement>(".explode-control input")!;
    exploded.value = "0.75";
    exploded.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    finishTerrain?.();

    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));
    expect(name.value).toBe("Renamed while loading");
    expect(target.querySelector<HTMLInputElement>(".explode-control input")?.value).toBe("0.75");
  });

  it("keeps terrain generation running when undo only restores the project name", async () => {
    let finishTerrain: (() => void) | undefined;
    let terrainSignal: AbortSignal | undefined;
    loadTerrainMock.mockImplementation((requested: typeof DEFAULT_PROJECT, signal: AbortSignal) => new Promise((resolve) => {
      terrainSignal = signal;
      finishTerrain = () => resolve({ source: { ...createSyntheticSource(requested, 32), sourceKind: "real" as const, vectorStatus: "available" as const }, fallback: false });
    }));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const name = target.querySelector<HTMLInputElement>('input[aria-label="Project name"]')!;
    name.value = "Renamed first";
    name.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    const generate = target.querySelector<HTMLButtonElement>(".generate-button")!;
    generate.click();
    await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledOnce());

    target.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click();
    await tick();
    expect(name.value).toBe(DEFAULT_PROJECT.name);
    expect(terrainSignal?.aborted).toBe(false);
    expect(generate.textContent).toContain("Cancel generation");

    finishTerrain?.();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));
    expect(name.value).toBe(DEFAULT_PROJECT.name);
  });

  it("keeps terrain generation running through text-size edits and renders the latest size", async () => {
    let finishTerrain: (() => void) | undefined;
    let terrainSignal: AbortSignal | undefined;
    loadTerrainMock.mockImplementation((requested: typeof DEFAULT_PROJECT, signal: AbortSignal) => new Promise((resolve) => {
      terrainSignal = signal;
      finishTerrain = () => resolve({ source: { ...createSyntheticSource(requested, 32), sourceKind: "real" as const, vectorStatus: "available" as const }, fallback: false });
    }));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const generate = target.querySelector<HTMLButtonElement>(".generate-button")!;
    generate.click();
    await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledOnce());

    const size = target.querySelector<HTMLInputElement>('input[aria-label="Text size"]')!;
    size.value = "5";
    size.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(terrainSignal?.aborted).toBe(false);
    expect(generate.textContent).toContain("Cancel generation");
    // Undoing the style edit mid-run keeps the run alive too.
    target.querySelector<HTMLButtonElement>('button[aria-label="Undo"]')!.click();
    await tick();
    target.querySelector<HTMLButtonElement>('button[aria-label="Redo"]')!.click();
    await tick();
    expect(terrainSignal?.aborted).toBe(false);

    finishTerrain?.();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));
    expect(target.querySelector<HTMLInputElement>('input[aria-label="Text size slider"]')?.value).toBe("5");
    expect(target.querySelector(".context-export-status")?.textContent).toContain("Ready to export");
  });

  it("applies style edits made during a generation that fails or is canceled", async () => {
    const { connectAtomm } = await import("./atomm-bridge");
    let failTerrain: (() => void) | undefined;
    loadTerrainMock.mockImplementation((_project, signal: AbortSignal) => new Promise((_resolve, reject) => {
      failTerrain = () => reject(new Error("Elevation service unavailable"));
      signal.addEventListener("abort", () => reject(new DOMException("Canceled", "AbortError")), { once: true });
    }));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const current = vi.mocked(connectAtomm).mock.lastCall![0] as () => { geometry: GeometryIRV1 };
    const generate = target.querySelector<HTMLButtonElement>(".generate-button")!;
    target.querySelector<HTMLButtonElement>(".linework-customize")!.click();
    await tick();
    const chooseTrailPattern = async (label: string) => {
      [...target.querySelectorAll<HTMLButtonElement>('.trail-pattern-options button[role="radio"]')].find((button) => button.textContent?.includes(label))!.click();
      await tick();
    };

    generate.click();
    await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledOnce());
    await chooseTrailPattern("Dotted");
    expect(generate.textContent).toContain("Cancel generation");
    expect(current().geometry.lineStyle.trailPattern).not.toBe("dotted");
    failTerrain!();
    await vi.waitFor(() => expect(current().geometry.lineStyle.trailPattern).toBe("dotted"));
    expect(target.querySelector(".status-line")?.textContent).toContain("Elevation service unavailable");

    generate.click();
    await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledTimes(2));
    await chooseTrailPattern("Dashed");
    generate.click();
    await vi.waitFor(() => expect(current().geometry.lineStyle.trailPattern).toBe("dashed"));
    expect(target.querySelector(".status-line")?.textContent).toContain("Generation canceled");
  });

  it("reports a rejected import on the status line without ending a running generation", async () => {
    loadTerrainMock.mockImplementation((_project, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Canceled", "AbortError")), { once: true })));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const generate = target.querySelector<HTMLButtonElement>(".generate-button")!;
    generate.click();
    await vi.waitFor(() => expect(loadTerrainMock).toHaveBeenCalledOnce());
    const input = target.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["not json"], "broken.json", { type: "application/json" })] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).not.toContain("Fetching elevation and map details"));
    expect(generate.textContent).toContain("Cancel generation");
    expect(target.querySelector(".preview-stage")?.getAttribute("aria-busy")).toBe("true");
  });

  it("does not let an unresolved platform toast block generation", async () => {
    window.atomm = {
      lifecycle: { on: vi.fn() },
      ui: { toast: vi.fn(() => new Promise<string>(() => undefined)), closeToast: vi.fn(async () => undefined) },
      app: { getLocale: vi.fn(async () => "en-US"), getSupportedLocales: vi.fn(async () => [{ code: "en", name: "English" }]) },
      user: { isLoggedIn: vi.fn(async () => false), login: vi.fn(async () => false) },
    };
    loadTerrainMock.mockImplementation(() => new Promise(() => undefined));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!.click();
    await tick();
    expect(loadTerrainMock).toHaveBeenCalledOnce();
  });

  it("updates every Map Details feature without pressing Generate", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const stage = target.querySelector<HTMLElement>(".preview-stage")!;
    const cases = [
      ["Roads", "road"],
      ["Trails", "trail"],
      ["Water outlines", "water"],
      ["Assembly guides", "alignment"],
      ["Elevation labels", "elevation"],
      ["North arrow", "north"],
      ["Scale bar", "scale"],
    ] as const;

    for (const [label, attribute] of cases) {
      const input = target.querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`)!;
      expect(Number(stage.dataset[`${attribute}Markings` as keyof DOMStringMap])).toBeGreaterThan(0);
      input.click();
      await vi.waitFor(() => expect(input.getAttribute("aria-checked"), label).toBe("false"));
      await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent, label).toMatch(/updated/i));
      await vi.waitFor(() => expect(stage.dataset[`${attribute}Markings` as keyof DOMStringMap], label).toBe("0"));
    }
    const transportationLabels = target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Transportation labels"]')!;
    expect(transportationLabels.getAttribute("aria-checked")).toBe("false");
    transportationLabels.click();
    await vi.waitFor(() => expect(transportationLabels.getAttribute("aria-checked")).toBe("true"));
    expect(loadTerrainMock).not.toHaveBeenCalled();
  });

  it("keeps the current preview visible and interactive during an expensive detail refresh", async () => {
    const projectWithoutVectors = { ...DEFAULT_PROJECT, showRoads: false, showTrails: false, showWater: false, showWaterDepth: false };
    const source = { ...createSyntheticSource(projectWithoutVectors, 32), sourceKind: "real" as const, vectorStatus: "not-requested" as const };
    loadTerrainMock.mockResolvedValue({ source, fallback: false });
    loadVectorMarkingsMock.mockImplementation((_bounds, _zoom, _project, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Canceled", "AbortError")), { once: true });
    }));
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    for (const label of ["Roads", "Trails", "Water outlines", "Water depth"]) {
      target.querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`)!.click();
      await vi.waitFor(() => expect(target.querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`)!.getAttribute("aria-checked")).toBe("false"));
    }
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!.click();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));

    target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Roads"]')!.click();
    await tick();
    const stage = target.querySelector<HTMLElement>(".preview-stage")!;
    const feedback = stage.querySelector<HTMLElement>(".preview-update-overlay")!;
    expect(stage.getAttribute("aria-busy")).toBe("true");
    expect(feedback.textContent).toContain("Refreshing preview");
    expect(feedback.textContent).toContain("Updating map details");
    expect(getComputedStyle(feedback).pointerEvents).toBe("none");
    expect(stage.querySelector('[data-testid="three-preview"]')).not.toBeNull();
    expect(target.querySelector(".status-line")?.classList.contains("status-loading")).toBe(true);
  });

  it("enables labels after a real generation without refetching retained names", async () => {
    const source = { ...createSyntheticSource(DEFAULT_PROJECT, 32), sourceKind: "real" as const, markings: [{ id: "named-road", kind: "road" as const, operation: "engrave" as const, transportationClass: "major-road" as const, label: "Rim Drive", points: [{ x: -130, y: 0 }, { x: 130, y: 0 }] }] };
    loadTerrainMock.mockResolvedValue({ source, fallback: false });
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!.click();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));
    const stage = target.querySelector<HTMLElement>(".preview-stage")!;
    expect(stage.dataset.transportationLabelMarkings).toBe("0");
    target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Transportation labels"]')!.click();
    await vi.waitFor(() => expect(Number(stage.dataset.transportationLabelMarkings)).toBeGreaterThan(0));
    expect(loadVectorMarkingsMock).not.toHaveBeenCalled();
  });

  it("renders named road engravings when transportation labels are enabled", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const stage = target.querySelector<HTMLElement>(".preview-stage")!;
    const labels = target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Transportation labels"]')!;
    expect(stage.dataset.transportationLabelMarkings).toBe("0");
    labels.click();
    await vi.waitFor(() => expect(Number(stage.dataset.transportationLabelMarkings)).toBeGreaterThan(0));
    expect(target.querySelector(".status-line")?.textContent).toMatch(/updated/i);
    expect(loadTerrainMock).not.toHaveBeenCalled();
  });

  it("commits only the latest result when a detail is toggled rapidly", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const roads = target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Roads"]')!;
    roads.click(); roads.click();
    const stage = target.querySelector<HTMLElement>(".preview-stage")!;
    await vi.waitFor(() => expect(Number(stage.dataset.roadMarkings)).toBeGreaterThan(0));
    expect(roads.getAttribute("aria-checked")).toBe("true");
  });

  it("fetches only vector markings when a generated source did not request them", async () => {
    const source = { ...createSyntheticSource(DEFAULT_PROJECT, 32), sourceKind: "real" as const, vectorStatus: "not-requested" as const };
    loadTerrainMock.mockResolvedValue({ source, fallback: false });
    loadVectorMarkingsMock.mockResolvedValue({
      markings: [{ id: "fetched-road", kind: "road", operation: "engrave", elevationM: source.elevation.min, points: [{ x: -100, y: -80 }, { x: 100, y: -80 }] }],
      inland: [],
      ocean: [],
    });
    loadLakeAreasMock.mockResolvedValue([]);
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    for (const label of ["Roads", "Trails", "Water outlines", "Water depth"]) {
      const input = target.querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`)!;
      input.click();
      await vi.waitFor(() => expect(input.getAttribute("aria-checked")).toBe("false"));
    }
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!.click();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));
    const roads = target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Roads"]')!;
    roads.click();
    const stage = target.querySelector<HTMLElement>(".preview-stage")!;
    await vi.waitFor(() => expect(loadVectorMarkingsMock).toHaveBeenCalledOnce());
    expect(loadVectorMarkingsMock.mock.calls[0]?.[2]).toMatchObject({ showRoads: true, showTrails: false, showWater: false });
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Map details updated"));
    await vi.waitFor(() => expect(Number(stage.dataset.roadMarkings)).toBeGreaterThan(0));
    expect(loadTerrainMock).toHaveBeenCalledOnce();
  });


  it("refetches newly enabled vector categories after a complete generation", async () => {
    const generated = { ...createSyntheticSource(DEFAULT_PROJECT, 32), sourceKind: "real" as const, vectorStatus: "available" as const };
    loadTerrainMock.mockResolvedValue({ source: generated, fallback: false });
    loadVectorMarkingsMock.mockResolvedValue({
      markings: [{ id: "fetched-boundary", kind: "boundary", operation: "engrave", points: [{ x: -100, y: -40 }, { x: 100, y: 40 }] }],
      inland: [],
      ocean: [],
      truncated: false,
    });
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!.click();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));
    target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="State and province boundaries"]')!.click();
    await vi.waitFor(() => expect(loadVectorMarkingsMock).toHaveBeenCalledOnce());
    expect(loadVectorMarkingsMock.mock.calls[0]?.[2]).toMatchObject({ showBoundaries: true });
  });

  it("fetches and renders state and province boundaries on demand", async () => {
    const projectWithoutVectors = { ...DEFAULT_PROJECT, showRoads: false, showTrails: false, showWater: false, showBoundaries: false, showWaterDepth: false };
    const source = { ...createSyntheticSource(projectWithoutVectors, 32), sourceKind: "real" as const, vectorStatus: "not-requested" as const };
    loadTerrainMock.mockResolvedValue({ source, fallback: false });
    loadVectorMarkingsMock.mockResolvedValue({
      markings: [{ id: "fetched-boundary", kind: "boundary", operation: "engrave", points: [{ x: -100, y: -40 }, { x: 100, y: 40 }] }],
      inland: [],
      ocean: [],
    });
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    for (const label of ["Roads", "Trails", "Water outlines", "Water depth"]) {
      const input = target.querySelector<HTMLButtonElement>(`button[role="switch"][aria-label="${label}"]`)!;
      input.click();
      await vi.waitFor(() => expect(input.getAttribute("aria-checked")).toBe("false"));
    }
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!.click();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));

    const boundaries = target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="State and province boundaries"]')!;
    boundaries.click();
    await vi.waitFor(() => expect(loadVectorMarkingsMock).toHaveBeenCalledOnce());
    expect(loadVectorMarkingsMock.mock.calls[0]?.[2]).toMatchObject({ showBoundaries: true, showRoads: false, showTrails: false, showWater: false });
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Map details updated"));
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Cut layers"))!.click();
    await vi.waitFor(() => expect(target.querySelector('[data-marking-kind="boundary"]')).not.toBeNull());
    expect(boundaries.getAttribute("aria-checked")).toBe("true");
  });

  it("generates and renders a coordinate grid locally without fetching vectors", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();

    const coordinateGrid = target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Latitude and longitude grid"]')!;
    coordinateGrid.click();
    await vi.waitFor(() => expect(coordinateGrid.getAttribute("aria-checked")).toBe("true"));
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toMatch(/updated/i));
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Cut layers"))!.click();
    await vi.waitFor(() => expect(target.querySelector('[data-marking-kind="grid"]')).not.toBeNull());
    expect(loadVectorMarkingsMock).not.toHaveBeenCalled();
  });

  it("adds, edits, symbolizes, and removes an arbitrary marker list", async () => {
    const { saveProject } = await import("../storage");
    vi.mocked(saveProject).mockClear();
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    // Wait for startup restore to enable autosave before editing the marker.
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalled(), { timeout: 2_000 });

    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Add marker"))!.click();
    await vi.waitFor(() => expect(target.querySelectorAll(".marker-card")).toHaveLength(1));
    expect(target.querySelector<HTMLInputElement>('input[aria-label="Marker 1 latitude"]')?.value).toBe(String(DEFAULT_PROJECT.location.lat));
    expect(target.querySelector<HTMLInputElement>('input[aria-label="Marker 1 longitude"]')?.value).toBe(String(DEFAULT_PROJECT.location.lon));
    const size = target.querySelector<HTMLInputElement>('input[aria-label="Marker 1 size"]')!;
    expect(size.value).toBe("8");
    size.value = "16";
    size.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(size.value).toBe("16");
    // Flush the pending snapshot: covered preview work can occupy the main
    // thread longer than waitFor's default timeout before the save timer runs.
    window.dispatchEvent(new Event("pagehide"));
    expect(vi.mocked(saveProject).mock.lastCall?.[0].markers[0]?.sizeMm).toBe(16);
    const star = target.querySelector<HTMLButtonElement>('.marker-symbol-options button[title="Star"]')!;
    star.click();
    await vi.waitFor(() => expect(star.getAttribute("aria-checked")).toBe("true"));
    await vi.waitFor(() => expect(Number(target.querySelector<HTMLElement>(".preview-stage")?.dataset.markerMarkings)).toBeGreaterThan(0));
    expect(loadVectorMarkingsMock).not.toHaveBeenCalled();

    target.querySelector<HTMLButtonElement>('button[aria-label="Remove marker 1"]')!.click();
    await vi.waitFor(() => expect(target.querySelectorAll(".marker-card")).toHaveLength(0));
    await vi.waitFor(() => expect(target.querySelector<HTMLElement>(".preview-stage")?.dataset.markerMarkings).toBe("0"));
  });

  it("adds custom trail and boundary paths with arbitrary coordinate points", async () => {
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();

    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Add path"))!.click();
    await vi.waitFor(() => expect(target.querySelectorAll(".custom-line-card")).toHaveLength(1));
    expect(target.querySelectorAll<HTMLInputElement>('input[aria-label^="Path 1 point"]')).toHaveLength(4);
    const boundary = [...target.querySelectorAll<HTMLButtonElement>('.custom-line-kind-options button[role="radio"]')].find((button) => button.textContent?.includes("Boundary"))!;
    boundary.click();
    await vi.waitFor(() => expect(boundary.getAttribute("aria-checked")).toBe("true"));
    target.querySelector<HTMLButtonElement>(".custom-point-add")!.click();
    await vi.waitFor(() => expect(target.querySelectorAll<HTMLInputElement>('input[aria-label^="Path 1 point"]')).toHaveLength(6));
    await vi.waitFor(() => expect(Number(target.querySelector<HTMLElement>(".preview-stage")?.dataset.customLineMarkings)).toBeGreaterThan(0));
    expect(loadVectorMarkingsMock).not.toHaveBeenCalled();

    target.querySelector<HTMLButtonElement>('button[aria-label="Remove point 3 from path 1"]')!.click();
    await vi.waitFor(() => expect(target.querySelectorAll<HTMLInputElement>('input[aria-label^="Path 1 point"]')).toHaveLength(4));
    target.querySelector<HTMLButtonElement>('button[aria-label="Remove path 1"]')!.click();
    await vi.waitFor(() => expect(target.querySelectorAll(".custom-line-card")).toHaveLength(0));
    await vi.waitFor(() => expect(target.querySelector<HTMLElement>(".preview-stage")?.dataset.customLineMarkings).toBe("0"));
  });


  it("loads lake metadata when switching a generated engraving back to layered relief", async () => {
    loadTerrainMock.mockImplementation(async (requested: typeof DEFAULT_PROJECT) => ({
      source: { ...createSyntheticSource(requested, 32), sourceKind: "real" as const, vectorStatus: "available" as const, lakeDataStatus: "not-requested" as const },
      fallback: false,
    }));
    loadLakeAreasMock.mockResolvedValue([]);
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    target.querySelector<HTMLButtonElement>('button[role="radio"][aria-label="Flat engraving"]')!.click();
    await vi.waitFor(() => expect(target.querySelector<HTMLButtonElement>('button[role="radio"][aria-label="Flat engraving"]')!.getAttribute("aria-checked")).toBe("true"));
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!.click();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Engraving ready"));
    target.querySelector<HTMLButtonElement>('button[role="radio"][aria-label="Layered relief"]')!.click();
    await vi.waitFor(() => expect(loadLakeAreasMock).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(target.querySelector<HTMLButtonElement>('button[role="radio"][aria-label="Layered relief"]')!.getAttribute("aria-checked")).toBe("true"));
  });

  it.each([[false, false], [true, false], [false, true]])("loads NOAA on enabling depth (unavailable=%s, OSM fallback=%s)", async (unavailable, osmFallback) => {
    noaaArchive.getHeader.mockResolvedValue({ tileType: 2, minZoom: 0, maxZoom: 11 });
    noaaArchive.getMetadata.mockResolvedValue({ topostack_dataset: "noaa-great-lakes-v1", topostack_encoding: "depth-terrarium-v1" });
    const png = readFileSync("src/fixtures/noaa-erie-z11.png");
    if (unavailable) noaaArchive.getZxy.mockRejectedValue(new Error("NOAA offline"));
    else noaaArchive.getZxy.mockResolvedValue({ data: Uint8Array.from(png).buffer });
    const source = {
      ...createSyntheticSource(DEFAULT_PROJECT, 16), bounds: noaaFixture.bounds,
      elevation: { width: 16, height: 16, values: new Float32Array(256).fill(180), min: 180, max: 180 },
      sourceKind: "real" as const, vectorStatus: "available" as const, lakeDataStatus: "not-requested" as const, waterAreas: [],
    };
    const polygon = { outer: [{ x: -80, y: -60 }, { x: 80, y: -60 }, { x: 80, y: 60 }, { x: -80, y: 60 }, { x: -80, y: -60 }], holes: [] };
    loadTerrainMock.mockResolvedValue({ source: { ...source, inlandWaterAreas: osmFallback ? [polygon] : [] }, fallback: false });
    if (osmFallback) loadLakeAreasMock.mockRejectedValue(new Error("Lake archive offline"));
    else loadLakeAreasMock.mockResolvedValue([{
      id: "erie", hylakId: 9, kind: "lake", name: "Erie", maxDepthM: 64, lmaxM: 10000, polygon,
    }]);
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();
    const depth = target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Water depth"]')!;
    depth.click();
    await vi.waitFor(() => expect(depth.getAttribute("aria-checked")).toBe("false"));
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!.click();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));
    expect(noaaArchive.getZxy).not.toHaveBeenCalled();
    depth.click();
    await vi.waitFor(() => expect(noaaArchive.getZxy).toHaveBeenCalled());
    await vi.waitFor(() => expect(target.textContent).toContain(unavailable ? "Some surveyed lake-floor data is unavailable" : "Surveyed lake-floor data is used where available"));
    expect(target.querySelector(".context-export-status")?.textContent).toContain("Ready to export");
    if (!unavailable) {
      const calls = noaaArchive.getZxy.mock.calls.length;
      const slider = target.querySelector<HTMLInputElement>('input[aria-label="Water depth exaggeration slider"]')!;
      slider.value = "2";
      slider.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("updated"));
      expect(noaaArchive.getZxy).toHaveBeenCalledTimes(calls);
    }
  });

  it("fetches lake metadata when water depth is enabled after generation", async () => {
    const projectWithoutDepth = { ...DEFAULT_PROJECT, showWaterDepth: false };
    const source = {
      ...createSyntheticSource(projectWithoutDepth, 32),
      sourceKind: "real" as const,
      vectorStatus: "available" as const,
      lakeDataStatus: "not-requested" as const,
      waterAreas: [],
    };
    loadTerrainMock.mockResolvedValue({ source, fallback: false });
    loadLakeAreasMock.mockResolvedValue([]);
    const target = document.createElement("div");
    component = mount(App, { target, props: { initialPreview: structuredClone(initialPreview) } });
    await tick();

    const depth = target.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Water depth"]')!;
    depth.click();
    await vi.waitFor(() => expect(depth.getAttribute("aria-checked")).toBe("false"));
    [...target.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Generate terrain"))!.click();
    await vi.waitFor(() => expect(target.querySelector(".status-line")?.textContent).toContain("Real terrain ready"));

    depth.click();
    await vi.waitFor(() => expect(loadLakeAreasMock).toHaveBeenCalledOnce());
    expect(loadVectorMarkingsMock).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(depth.getAttribute("aria-checked")).toBe("true"));
  });
});
