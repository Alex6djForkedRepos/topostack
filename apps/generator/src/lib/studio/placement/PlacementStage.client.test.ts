import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearRegisteredFonts, decodeFontGlyphs, DEFAULT_PROJECT, generateGeometry, registerFont } from "@topostack/core";
import { createSamplePreviewSource } from "$lib/domain/sample-preview";

const load = vi.hoisted(() => vi.fn<() => Promise<void>>());
vi.mock("$lib/domain/fonts", () => ({ ensureFonts: load }));
import PlacementStage from "./PlacementStage.svelte";

let component: ReturnType<typeof mount>;
let target: HTMLDivElement;
const geometry = generateGeometry(DEFAULT_PROJECT, createSamplePreviewSource());
const project = { ...DEFAULT_PROJECT, plaque: { enabled: true, text: "Title", font: "jost" as const, sizeMm: 6, placement: { anchor: "center" as const, offset: { x: 0, y: 0 } } } };
function mountStage() {
  target = document.createElement("div");
  component = mount(PlacementStage, { target, props: {
    backdrop: "flat", phase: "editing", geometry, project, cropShape: "rectangle", session: { selected: "plaque", draft: {} }, marginMm: 10,
    hiddenPrefixes: ["north-", "plaque-", "scale-"], onChange: vi.fn(), onDone: vi.fn(), onCancel: vi.fn(),
  } });
}
function registerJost() {
  registerFont(decodeFontGlyphs(JSON.parse(readFileSync(join(import.meta.dirname, "../../domain/font-glyphs/jost.json"), "utf8"))));
}
beforeEach(() => {
  clearRegisteredFonts(); load.mockReset();
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});
afterEach(async () => { if (component) await unmount(component); vi.unstubAllGlobals(); clearRegisteredFonts(); });

it("waits for glyphs before measuring a draft and renders its knockout after loading", async () => {
  let resolve!: () => void;
  load.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
  mountStage(); await tick();
  expect(target.textContent).toContain("Loading engraving font");
  expect(target.querySelector("[data-placement-layer]")).toBeNull();
  registerJost(); resolve();
  await vi.waitFor(() => expect(target.querySelector('[data-placeable="plaque"]')).not.toBeNull());
  expect(target.querySelector('[data-placement-knockout="plaque"]')?.getAttribute("fill")).toBe("black");
  expect(target.querySelector("[data-placement-artwork] > g")?.getAttribute("mask")).toContain("before-title");
});

it("offers retry after a glyph failure and recovers without closing the draft", async () => {
  load.mockRejectedValueOnce(new Error("Font unavailable"));
  mountStage();
  await vi.waitFor(() => expect(target.textContent).toContain("Font unavailable"));
  load.mockImplementationOnce(async () => { registerJost(); });
  [...target.querySelectorAll("button")].find(button => button.textContent === "Retry")!.click();
  await vi.waitFor(() => expect(target.querySelector('[data-placeable="plaque"]')).not.toBeNull());
  expect(load).toHaveBeenCalledTimes(2);
});
