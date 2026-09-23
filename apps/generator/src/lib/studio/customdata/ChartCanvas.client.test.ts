import { mount, tick, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { encodeChartDepths } from "@topostack/data-contracts/chart-bathymetry";
import type { ChartBuildResult } from "$lib/domain/chart-build";
import type { ChartableLake } from "$lib/domain/lake-lookup";
import ChartCanvas from "$lib/studio/customdata/ChartCanvas.svelte";
import { draft, resetDraft } from "$lib/studio/customdata/chart-draft.svelte";
import { resetSession, session } from "$lib/studio/customdata/chart-tracing.svelte";

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

  it("turns a click into a depth at that point of the chart", async () => {
    withImage();
    const target = open();
    await tick();
    const canvas = target.querySelector<HTMLCanvasElement>(".chart-canvas")!;
    // The picture is drawn to fit, so a click is read as a share of its box.
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 300 } as DOMRect);

    canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 200, clientY: 150 }));
    await tick();
    expect(draft.depths, "a click with no depth typed is not a depth of zero").toHaveLength(0);
    expect(target.querySelector("[role=alert]")?.textContent).toContain("Type the depth");

    session.pendingDepth = "10";
    canvas.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 200, clientY: 150 }));
    await tick();
    // The reach is a fixed distance on screen: 12 px of a 400 px box over a 40 px image.
    expect(draft.depths).toEqual([{ x: 20, y: 15, value: 10, reach: 1.2000000000000002 }]);
    expect(target.textContent).toContain("one more needed");
  });

  it("places depths from the keyboard with a crosshair", async () => {
    withImage();
    const target = open();
    await tick();
    const canvas = target.querySelector<HTMLCanvasElement>(".chart-canvas")!;
    expect(canvas.tabIndex).toBe(0);
    // Drawn 400 px wide over a 40 px picture: a screen pixel is a tenth of an image pixel.
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 400, height: 300 } as DOMRect);
    canvas.dispatchEvent(new FocusEvent("focus"));
    const key = (key: string, shiftKey = false) => canvas.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
    key("ArrowRight");
    key("ArrowDown", true);
    session.pendingDepth = "10";
    key("Enter");
    await tick();
    // From the middle (20, 15): right 2 screen px, down 20.
    expect(draft.depths).toHaveLength(1);
    expect(draft.depths[0]!.x).toBeCloseTo(20.2);
    expect(draft.depths[0]!.y).toBeCloseTo(17);
    expect(draft.depths[0]!.reach).toBeCloseTo(1.2);
    expect(target.textContent).toContain("% across");
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
    expect(reopened.textContent).toContain("one more needed");
  });
});
