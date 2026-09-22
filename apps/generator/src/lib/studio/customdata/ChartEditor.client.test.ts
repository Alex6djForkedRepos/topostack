import { mount, tick, unmount } from "svelte";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import ChartEditor from "$lib/studio/customdata/ChartEditor.svelte";
import { draft, resetDraft } from "$lib/studio/customdata/chart-draft.svelte";

const lake = { id: "lake-1", name: "Round Lake", hylakId: 9092, footprint: 1, spanKm: [1, 1] as [number, number], distanceKm: 0, outline: [[-80, 45], [-79.99, 45], [-79.99, 45.01]] as [number, number][] };

/** A 40x30 white page, as a decoded chart image. jsdom has no ImageData. */
const pixels = () => ({ width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4).fill(255), colorSpace: "srgb" }) as unknown as ImageData;

describe("chart editor", () => {
  let component: ReturnType<typeof mount> | undefined;

  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext ??= () => null;
  });
  beforeEach(() => {
    resetDraft();
    draft.lake = lake;
  });
  afterEach(async () => {
    if (component) await unmount(component);
    component = undefined;
    document.body.replaceChildren();
    resetDraft();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const open = (onKeep = vi.fn(async () => {})) => {
    const target = document.createElement("div");
    document.body.append(target);
    component = mount(ChartEditor, { target, props: { onKeep } });
    return target;
  };

  /** Walks the editor from an upload to the depth-placing stage. */
  async function uploadChart(target: HTMLElement): Promise<void> {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 40, height: 30, close: vi.fn() })));
    // jsdom has no Web Crypto digest; the file's hash only lands in provenance.
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer) } });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(), getImageData: vi.fn(() => pixels()), putImageData: vi.fn(), createImageData: vi.fn(() => pixels()),
      beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(), fillText: vi.fn(),
    } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
    const input = target.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(input, "files", { value: [new File([new Uint8Array([1, 2, 3])], "chart.png", { type: "image/png" })], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    for (let step = 0; step < 6; step += 1) await tick();
  }

  it("asks for a chart image first", () => {
    const target = open();
    expect(target.textContent).toContain("Choose a chart image");
    expect(target.querySelector("canvas")).toBeNull();
  });

  it("will not trace until a second depth is placed", async () => {
    const target = open();
    await uploadChart(target);
    const canvas = target.querySelector<HTMLCanvasElement>(".chart-canvas");
    expect(canvas, "the chart should be shown once it is read").not.toBeNull();
    const trace = [...target.querySelectorAll("button")].find((button) => button.textContent?.includes("Trace this chart"))!;
    expect(trace.disabled).toBe(true);

    const depth = target.querySelector<HTMLInputElement>('input[placeholder="e.g. 10"]')!;
    const place = async (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(depth), "value")!.set!;
      setter.call(depth, value);
      depth.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();
      canvas!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
      await tick();
    };
    await place("10");
    expect(trace.disabled, "one depth cannot say which way is deeper").toBe(true);
    expect(target.textContent).toContain("one more needed");
    await place("20");
    expect(trace.disabled).toBe(false);
    expect(draft.depths).toHaveLength(2);
  });

  it("says what to do when a depth is placed without a number", async () => {
    const target = open();
    await uploadChart(target);
    target.querySelector<HTMLCanvasElement>(".chart-canvas")!.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 5, clientY: 5 }));
    await tick();
    expect(target.querySelector("[role=alert]")?.textContent).toContain("Type the depth");
    expect(draft.depths).toHaveLength(0);
  });

  it("reports a file it cannot read instead of failing silently", async () => {
    const target = open();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("Unsupported image"); }));
    const input = target.querySelector<HTMLInputElement>("input[type=file]")!;
    Object.defineProperty(input, "files", { value: [new File([new Uint8Array([1])], "chart.txt")], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    for (let step = 0; step < 4; step += 1) await tick();
    expect(target.querySelector("[role=alert]")?.textContent).toContain("Unsupported image");
  });

  it("keeps a half-traced chart when the view is left and reopened", async () => {
    const target = open();
    await uploadChart(target);
    draft.depths = [{ x: 1, y: 1, value: 10 }];
    await tick();
    // Leaving the custom data view unmounts the editor; the draft outlives it.
    await unmount(component!);
    component = undefined;
    expect(draft.image, "the picture should still be there").toBeDefined();
    const reopened = open();
    for (let step = 0; step < 3; step += 1) await tick();
    expect(reopened.querySelector(".chart-canvas")).not.toBeNull();
    expect(reopened.textContent).toContain("one more needed");
  });
});
