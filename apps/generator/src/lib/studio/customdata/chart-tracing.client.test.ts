import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { UserChartBathymetryV1 } from "@topostack/data-contracts/chart-bathymetry";
import type { ChartBuildResult } from "$lib/domain/chart-build";
import { draft, resetDraft } from "$lib/studio/customdata/chart-draft.svelte";
import { canTrace, chooseChartFile, keepChart, placeDepth, removeDepth, resetSession, resultIsCurrent, session, traceChart, traceInputsKey } from "$lib/studio/customdata/chart-tracing.svelte";

/** The PDF renderer; pdf.js itself needs a real browser, so it is exercised end to end instead. */
const pdf = vi.hoisted(() => ({ renderPdfPage: vi.fn() }));
vi.mock("$lib/domain/chart-pdf", () => pdf);

/** The trace worker, held open so a test decides when each trace finishes. */
const builds: { resolve: (result: ChartBuildResult) => void; reject: (error: unknown) => void; request: Record<string, unknown> }[] = [];
vi.mock("$lib/workers/chart-trace-client", () => ({
  ChartTraceClient: class {
    build(request: Record<string, unknown>) {
      return new Promise<ChartBuildResult>((resolve, reject) => builds.push({ resolve, reject, request }));
    }
    dispose() {}
  },
}));

/** A 40x30 white page, as a decoded chart image. jsdom has no ImageData. */
const pixels = () => ({ width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4).fill(255), colorSpace: "srgb" }) as unknown as ImageData;
const traced = (record: Partial<UserChartBathymetryV1> = {}) => ({ record: { id: "chart-1", lake: { name: "Round Lake" }, ...record }, report: { deepestM: 4, coverage: 1, iou: 0.98, snapUncertain: false } }) as unknown as ChartBuildResult;

describe("tracing a depth chart", () => {
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext ??= () => null;
  });
  afterEach(() => {
    builds.length = 0;
    resetDraft();
    resetSession();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Reads a file the way the sidebar's upload control does. */
  async function upload(name = "chart.png"): Promise<void> {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 40, height: 30, close: vi.fn() })));
    // jsdom has no Web Crypto digest; the file's hash only lands in provenance.
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer) } });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(), getImageData: vi.fn(() => pixels()),
    } as unknown as ReturnType<HTMLCanvasElement["getContext"]>);
    await chooseChartFile(new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" }));
  }

  it("reads an upload into the draft and names the chart after its lake", async () => {
    draft.lake = { id: "lake-1", name: "Round Lake", hylakId: 9092, footprint: 1, spanKm: [1, 1], distanceKm: 0, clipped: false, outline: [[-80, 45], [-79.99, 45], [-79.99, 45.01]] };
    await upload();
    expect(draft.image).toMatchObject({ width: 40, height: 30 });
    expect(draft.imageName).toBe("chart.png");
    expect(draft.title).toBe("Round Lake depth chart");
    expect(session.error).toBe("");
  });

  it("reads a PDF page as the picture, and offers the other pages when one is blank", async () => {
    vi.stubGlobal("crypto", { subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer) } });
    const file = new File([new Uint8Array([37, 80, 68, 70])], "chart.pdf", { type: "application/pdf" });
    pdf.renderPdfPage.mockResolvedValueOnce({ pixels: pixels(), pages: 3, page: 1, blank: false });
    await chooseChartFile(file);
    expect(pdf.renderPdfPage).toHaveBeenCalledWith(expect.any(Uint8Array), 1, 2400);
    expect(draft.image).toMatchObject({ width: 40, height: 30 });
    expect(draft.imageName).toBe("chart.pdf, page 1");
    expect(draft.pdf).toMatchObject({ pages: 3, page: 1 });

    pdf.renderPdfPage.mockResolvedValueOnce({ pixels: pixels(), pages: 3, page: 2, blank: true });
    await chooseChartFile(file, 2);
    expect(draft.image, "a blank page is not a picture to trace").toBeUndefined();
    expect(draft.pdf).toMatchObject({ pages: 3, page: 2 });
    expect(session.error).toContain("Page 2 of this PDF is blank");
  });

  it("reports a file it cannot read as an image", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => { throw new Error("Unsupported image"); }));
    await chooseChartFile(new File([new Uint8Array([1])], "chart.txt"));
    expect(session.error).toContain("Unsupported image");
    expect(draft.image).toBeUndefined();
  });

  it("will not place a depth until one is typed", async () => {
    await upload();
    placeDepth(10, 12, 3);
    expect(draft.depths).toHaveLength(0);
    expect(session.error).toContain("Type the depth");

    session.pendingDepth = "10";
    placeDepth(10, 12, 3);
    expect(draft.depths).toEqual([{ x: 10, y: 12, value: 10, reach: 3 }]);
    expect(session.error).toBe("");
  });

  it("needs two depths, because one cannot say which way the lake deepens", async () => {
    await upload();
    session.pendingDepth = "10";
    placeDepth(4, 4, 3);
    expect(canTrace()).toBe(false);
    session.pendingDepth = "20";
    placeDepth(8, 8, 3);
    expect(canTrace()).toBe(true);
  });

  it("marks a traced result out of date whenever what it was traced from changes", async () => {
    await upload();
    session.pendingDepth = "10";
    placeDepth(4, 4, 3);
    draft.result = traced();
    draft.resultKey = traceInputsKey();
    expect(resultIsCurrent()).toBe(true);
    session.pendingDepth = "20";
    placeDepth(8, 8, 3);
    expect(resultIsCurrent(), "a new depth").toBe(false);

    draft.resultKey = traceInputsKey();
    removeDepth(0);
    expect(resultIsCurrent(), "a removed depth").toBe(false);

    draft.resultKey = traceInputsKey();
    draft.interval = "10";
    expect(resultIsCurrent(), "a new contour interval").toBe(false);

    draft.resultKey = traceInputsKey();
    draft.title = "Another name";
    expect(resultIsCurrent(), "a name is applied when kept, not traced").toBe(true);
  });

  it("sends placed depths as marks the tracer does not erase, and a missing surface as missing", async () => {
    draft.lake = { id: "lake-1", name: "Round Lake", hylakId: 9092, footprint: 1, spanKm: [1, 1], distanceKm: 0, clipped: false, outline: [[-80, 45], [-79.99, 45], [-79.99, 45.01]] };
    await upload();
    draft.reads = "elevation";
    session.pendingDepth = "10";
    placeDepth(4, 4, 3);
    session.pendingDepth = "20";
    placeDepth(8, 8, 3);
    void traceChart();
    expect(builds).toHaveLength(1);
    expect(builds[0]!.request.marks).toEqual([{ x: 4, y: 4, value: 10, reach: 3 }, { x: 8, y: 8, value: 20, reach: 3 }]);
    expect(builds[0]!.request.words).toBeUndefined();
    expect(builds[0]!.request.surface, "an empty surface box is not a surface of zero").toBeNaN();
  });

  it("drops a trace that finishes after its depths changed, and stays quiet when one is cancelled", async () => {
    draft.lake = { id: "lake-1", name: "Round Lake", hylakId: 9092, footprint: 1, spanKm: [1, 1], distanceKm: 0, clipped: false, outline: [[-80, 45], [-79.99, 45], [-79.99, 45.01]] };
    await upload();
    session.pendingDepth = "10";
    placeDepth(4, 4, 3);
    session.pendingDepth = "20";
    placeDepth(8, 8, 3);
    const first = traceChart();
    placeDepth(12, 12, 3);
    builds[0]!.resolve(traced());
    await first;
    expect(draft.result, "a stale trace must not land on the new depths").toBeUndefined();

    const second = traceChart();
    builds[1]!.reject(new DOMException("Chart tracing cancelled", "AbortError"));
    await second;
    expect(session.error).toBe("");
    expect(session.busy).toBe(false);
  });

  it("keeps a traced chart through the studio, and reports a browser that will not store it", async () => {
    expect(await keepChart(vi.fn()), "nothing to keep before a trace").toBe(false);

    draft.result = traced({ provenance: { title: "Round Lake depth chart", fileSha256: "0", tool: "chart-trace" }, license: { attestation: "own-work" } });
    expect(await keepChart(vi.fn()), "nothing current to keep").toBe(false);
    draft.resultKey = traceInputsKey();
    // The name and licence are chosen after the trace, and the kept record carries them.
    draft.title = "  Viking 2019  ";
    draft.attestation = "public-domain";
    const save = vi.fn(async () => ({ id: "chart-1", contentHash: "abc" }));
    expect(await keepChart(save)).toBe(true);
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      id: "chart-1",
      provenance: expect.objectContaining({ title: "Viking 2019", tool: "chart-trace" }),
      license: { attestation: "public-domain" },
    }));

    const failing = vi.fn(async () => { throw new Error("Storage is full."); });
    expect(await keepChart(failing)).toBe(false);
    expect(session.error).toBe("Storage is full.");
    expect(session.keeping).toBe(false);
  });
});
