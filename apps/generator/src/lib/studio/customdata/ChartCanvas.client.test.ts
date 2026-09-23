import { ChartTraceClient } from "$lib/workers/chart-trace-client";
import { mount, tick, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { encodeChartDepths } from "@topostack/data-contracts/chart-bathymetry";
import type { ChartBuildResult } from "$lib/domain/chart-build";
import type { ChartableLake } from "$lib/domain/lake-lookup";
import ChartCanvas from "$lib/studio/customdata/ChartCanvas.svelte";
import { draft, resetDraft } from "$lib/studio/customdata/chart-draft.svelte";
import { canTrace, resetSession, session } from "$lib/studio/customdata/chart-tracing.svelte";

const lake: ChartableLake = { id: "lake-1", name: "Round Lake", hylakId: 9092, footprint: 1, spanKm: [1, 1], distanceKm: 0, clipped: false, outline: [[-80, 45], [-79.99, 45], [-79.99, 45.01]] };
const pixels = () => ({ width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4).fill(255), colorSpace: "srgb" }) as unknown as ImageData;

describe("the chart on the custom data stage", () => {
  let component: ReturnType<typeof mount> | undefined;

  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext ??= () => null;
  });
  afterEach(async () => {
    if (component) await unmount(component);
    component = undefined;
    document.body.replaceChildren();
    resetDraft();
    resetSession();
    vi.restoreAllMocks();
  });

  function open(): HTMLElement {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData: vi.fn(), createImageData: vi.fn(() => pixels()),
      beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
    const target = document.createElement("div");
    document.body.append(target);
    component = mount(ChartCanvas, { target });
    return target;
  }

  /** Puts a decoded chart in the draft, as reading an upload would. */
  function withImage(): void {
    draft.lake = lake;
    draft.image = { width: 40, height: 30, data: pixels().data };
    draft.pixels = pixels();
  }

  it("asks for the lake first, then the picture, because both are chosen in the sidebar", async () => {
    const target = open();
    expect(target.textContent).toContain("search for the lake this chart shows");

    draft.lake = lake;
    await tick();
    expect(target.textContent).toContain("Choose a picture of Round Lake's chart");
    expect(target.querySelector("canvas")).toBeNull();
  });

  it("guides three confirmed points, with blank-value validation, cancellation, and correction", async () => {
    withImage();
    const target = open();
    await tick();
    const canvas = target.querySelector<HTMLCanvasElement>(".chart-canvas")!;
    await vi.waitFor(() => expect(canvas.getAttribute("aria-busy")).toBe("false"));
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 300 } as DOMRect);
    const pick = async (x: number, y: number) => {
      canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
      await tick();
    };
    const confirm = async (value: string) => {
      const input = target.querySelector<HTMLInputElement>("#chart-point-value")!;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();
      target.querySelector(".chart-point-card form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await tick();
    };
    await pick(200, 150);
    expect(draft.depths).toHaveLength(0);
    expect(document.activeElement).toBe(target.querySelector("#chart-point-value"));
    expect(target.querySelector('[role="dialog"]')?.textContent).toContain("Assign point 1");
    await confirm("");
    expect(target.querySelector('[role="alert"]')?.textContent).toContain("Enter a depth");
    expect(draft.depths).toHaveLength(0);
    await confirm("10");
    expect(draft.depths[0]).toMatchObject({ x: 20, y: 15, value: 10 });
    expect(document.activeElement).toBe(canvas);
    expect(target.textContent).toContain("Point 2 of 3");
    await pick(100, 100);
    expect(session.pendingDepth).toBe("");
    await confirm("20");
    expect(canTrace()).toBe(false);
    await pick(300, 200);
    expect(canTrace(), "an unconfirmed third point does not count").toBe(false);
    target.querySelector(".chart-point-card form")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await tick();
    expect(session.point).toBeUndefined();
    expect(draft.depths).toHaveLength(2);
    await pick(300, 200);
    await confirm("30");
    expect(canTrace()).toBe(true);
    expect(target.textContent).toContain("3 points confirmed");
    await pick(200, 150);
    expect(target.querySelector('[role="dialog"]')?.textContent).toContain("Edit point 1");
    await confirm("12");
    expect(draft.depths).toHaveLength(3);
    expect(draft.depths[0]?.value).toBe(12);
    await pick(50, 250);
    await confirm("40");
    expect(draft.depths).toHaveLength(4);
  });

  it("places depths from the keyboard with a crosshair", async () => {
    withImage();
    const target = open();
    await tick();
    const canvas = target.querySelector<HTMLCanvasElement>(".chart-canvas")!;
    expect(canvas.tabIndex).toBe(0);
    // Drawn 400 px wide over a 40 px picture: a screen pixel is a tenth of an image pixel.
    await vi.waitFor(() => expect(canvas.getAttribute("aria-busy")).toBe("false"));
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 300 } as DOMRect);
    canvas.dispatchEvent(new FocusEvent("focus"));
    const key = (key: string, shiftKey = false) => canvas.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
    key("ArrowRight");
    key("ArrowDown", true);
    key("Enter");
    await tick();
    expect(draft.depths).toHaveLength(0);
    session.pendingDepth = "10";
    target.querySelector(".chart-point-card form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await tick();
    // From the middle (20, 15): right 2 screen px, down 20.
    expect(draft.depths).toHaveLength(1);
    expect(draft.depths[0]!.x).toBeCloseTo(20.2);
    expect(draft.depths[0]!.y).toBeCloseTo(17);
    expect(draft.depths[0]!.reach).toBeCloseTo(1.2);
    expect(target.textContent).toContain("% across");
  });

  it("ignores contour detection from an image replaced while detection was running", async () => {
    const oldLines = Promise.withResolvers<{ points: [number, number][]; closed: boolean }[]>();
    const newLines = Promise.withResolvers<{ points: [number, number][]; closed: boolean }[]>();
    vi.spyOn(ChartTraceClient.prototype, "contours").mockReturnValueOnce(oldLines.promise).mockReturnValueOnce(newLines.promise);
    withImage();
    const target = open();
    await tick();
    withImage();
    await tick();
    newLines.resolve([]);
    await vi.waitFor(() => expect(target.querySelector("canvas")?.getAttribute("aria-busy")).toBe("false"));
    oldLines.resolve([{ points: [[0, 0], [40, 30]], closed: false }]);
    await tick();
    expect(target.textContent).toContain("No contour preview is available");
  });

  it("shows the traced lake bed and what the tracer made of the chart", async () => {
    withImage();
    draft.depths = [{ x: 4, y: 4, value: 10, reach: 2 }, { x: 8, y: 8, value: 20, reach: 2 }];
    draft.result = {
      record: { id: "chart-1", grid: { width: 2, height: 2, depthsDm: encodeChartDepths([1, 2, 3, 6.25]) } },
      report: { deepestM: 6.25, coverage: 0.8, iou: 0.72, snapUncertain: true },
    } as unknown as ChartBuildResult;
    const target = open();
    await tick();
    // Said in the chart's own units, which default to feet: 6.25 m is 20.5 ft.
    expect(target.querySelector(".chart-report")?.textContent).toContain("20.5 ft");
    expect(target.querySelector(".chart-report")?.textContent).toContain("80%");
    expect(target.textContent).toContain("does not match this lake closely");
    expect(target.textContent, "an incomplete trace says what fixes it").toContain("Placing another depth");
  });

  it("keeps a half-traced chart when the view is left and reopened", async () => {
    withImage();
    draft.depths = [{ x: 1, y: 1, value: 10, reach: 2 }];
    const target = open();
    await tick();
    expect(target.querySelector(".chart-canvas")).not.toBeNull();
    // Leaving the custom data view unmounts the stage; the draft outlives it.
    await unmount(component!);
    component = undefined;
    expect(draft.image, "the picture should still be there").toBeDefined();
    const reopened = open();
    await tick();
    expect(reopened.querySelector(".chart-canvas")).not.toBeNull();
    expect(reopened.textContent).toContain("Point 2 of 3");
  });
});
