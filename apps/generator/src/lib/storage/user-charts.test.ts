import { buildChartFromImage } from "$lib/domain/chart-build";
import { reviewFixture } from "$lib/domain/testing/chart-review-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CHART_BATHYMETRY_SCHEMA, encodeChartDepths, type UserChartBathymetryV1 } from "@topostack/data-contracts/chart-bathymetry";

const store = vi.hoisted(() => new Map<string, unknown>());
const failReads = vi.hoisted(() => ({ enabled: false }));
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => { if (failReads.enabled) throw new Error("Storage is blocked"); return store.get(key); }),
  set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
  del: vi.fn(async (key: string) => { store.delete(key); }),
  keys: vi.fn(async () => [...store.keys()]),
  getMany: vi.fn(async (keys: string[]) => { if (failReads.enabled) throw new Error("Storage is blocked"); return keys.map((key) => store.get(key)); }),
}));

const { chartContentHash, chartsForProject, currentChartReferences, deleteUserChart, listUserCharts, loadUserChart, loadUserCharts, saveProjectCharts, saveUserChart } = await import("$lib/storage/user-charts");

const chart = (id = "round-lake-chart", name = "Round Lake"): UserChartBathymetryV1 => ({
  schema: CHART_BATHYMETRY_SCHEMA,
  id,
  lake: { name, outline: [[-80, 45], [-79.99, 45], [-79.99, 45.01], [-80, 45]] },
  georef: { method: "snap", matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], rmsM: 2, iou: 0.95 },
  units: "m",
  labels: { kind: "depth" },
  intervalM: 1,
  contours: [{ depthM: 1, line: [[-79.999, 45.002], [-79.995, 45.005]], closed: false }],
  spots: [],
  grid: { bounds: { west: -80, south: 45, east: -79.99, north: 45.01 }, width: 2, height: 2, method: "harmonic", depthsDm: encodeChartDepths([0, 1, 2, 3]) },
  provenance: { title: `${name} depth map`, fileSha256: "a".repeat(64), tool: "chart-trace@test" },
  license: { attestation: "own-work" },
});

beforeEach(() => {
  store.clear();
  failReads.enabled = false;
  vi.restoreAllMocks();
});

describe("saved depth charts", () => {
  it("saves a chart under its own key and reads it back with the hash a project pins", async () => {
    const reference = await saveUserChart(chart());
    expect(reference.id).toBe("round-lake-chart");
    expect(reference.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect([...store.keys()].sort()).toEqual(["topostack:chart-summary:v1:round-lake-chart", "topostack:chart:v1:round-lake-chart"]);
    const loaded = await loadUserChart("round-lake-chart");
    expect(loaded?.contentHash).toBe(reference.contentHash);
    expect(loaded?.chart.lake.name).toBe("Round Lake");
    // The same chart always hashes the same, so a project's pin is stable.
    expect(await chartContentHash(chart())).toBe(reference.contentHash);
  });

  it("treats a missing, unreadable, or unavailable chart as no chart", async () => {
    expect(await loadUserChart("absent-lake-chart")).toBeUndefined();
    store.set("topostack:chart:v1:broken-lake-chart", { chart: { schema: "nonsense" } });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await loadUserChart("broken-lake-chart")).toBeUndefined();
    failReads.enabled = true;
    expect(await loadUserChart("round-lake-chart")).toBeUndefined();
  });

  it("loads one chart per lake, sharing a chart used twice", async () => {
    const ready = buildChartFromImage(reviewFixture().request).record;
    ready.review = { version: 1, profile: "closed-contours-v1", reviewedAt: new Date().toISOString(), contours: true, alignment: true, layers: true };
    const one = await saveUserChart({ ...ready, id: "round-lake-chart" });
    const two = await saveUserChart({ ...ready, id: "other-lake-chart" });
    const charts = await loadUserCharts({ "1": one, "2": one, "3": two, "4": { id: "absent-lake-chart", contentHash: "b".repeat(64) } });
    expect([...charts.keys()]).toEqual(["1", "2", "3"]);
    expect(charts.get("1")).toBe(charts.get("2"));
    expect(charts.get("3")!.chart.id).toBe("other-lake-chart");
    expect(await loadUserCharts(undefined)).toEqual(new Map());
  });

  it("retains legacy charts for export but excludes them from generation", async () => {
    const reference = await saveUserChart(chart());
    expect(await loadUserChart(reference.id)).toBeDefined();
    expect((await listUserCharts())[0]?.reviewed).toBe(false);
    expect(await loadUserCharts({ "1": reference })).toEqual(new Map());
    expect(await chartsForProject({ userDepthCharts: { "1": reference } })).toHaveLength(1);
  });

  it("lists saved charts newest first and deletes one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await saveUserChart(chart());
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));
    await saveUserChart(chart("other-lake-chart", "Other Lake"));
    vi.useRealTimers();
    // Listed by the chart's own name, with the lake it can carve beside it.
    expect((await listUserCharts()).map((item) => item.name)).toEqual(["Other Lake depth map", "Round Lake depth map"]);
    expect((await listUserCharts()).map((item) => item.lakeName)).toEqual(["Other Lake", "Round Lake"]);
    expect((await listUserCharts()).every((item) => item.hylakId === undefined)).toBe(true);
    await deleteUserChart("other-lake-chart");
    expect((await listUserCharts()).map((item) => item.id)).toEqual(["round-lake-chart"]);
    expect([...store.keys()].some((key) => key.includes("other-lake-chart")), "the summary goes with the chart").toBe(false);
  });

  it("lists from summaries without reading whole charts, and gives an older chart one", async () => {
    await saveUserChart(chart());
    // A chart saved before summaries existed.
    const legacy = chart("older-lake-chart", "Older Lake");
    store.set("topostack:chart:v1:older-lake-chart", { savedAt: "2025-01-01T00:00:00Z", contentHash: await chartContentHash(legacy), chart: legacy });
    const { get } = await import("idb-keyval");
    vi.mocked(get).mockClear();
    expect((await listUserCharts()).map((item) => item.id)).toEqual(["round-lake-chart", "older-lake-chart"]);
    expect(vi.mocked(get).mock.calls.map(([key]) => key), "only the chart with no summary is read whole").toEqual(["topostack:chart:v1:older-lake-chart"]);
    expect(store.has("topostack:chart-summary:v1:older-lake-chart")).toBe(true);
    vi.mocked(get).mockClear();
    await listUserCharts();
    expect(vi.mocked(get)).not.toHaveBeenCalled();
  });

  it("brings a project's references up to the charts as saved now", async () => {
    const first = await saveUserChart(chart());
    const references = { "1": first, "2": { id: "absent-lake-chart", contentHash: "b".repeat(64) } };
    expect(await currentChartReferences(references), "nothing changed: the same object").toBe(references);
    // The same chart saved again with different content, as an import would.
    const second = await saveUserChart({ ...chart(), intervalM: 2 });
    expect(second.contentHash).not.toBe(first.contentHash);
    expect(await currentChartReferences(references)).toEqual({ "1": second, "2": references["2"] });
    expect(await currentChartReferences(undefined)).toBeUndefined();
  });
});

describe("charts travelling with a project file", () => {
  it("exports only the charts the project references", async () => {
    const one = await saveUserChart(chart());
    await saveUserChart(chart("other-lake-chart", "Other Lake"));
    expect((await chartsForProject({ userDepthCharts: { "1": one, "2": one } })).map((item) => item.id)).toEqual(["round-lake-chart"]);
    expect(await chartsForProject({})).toEqual([]);
  });

  it("saves only referenced charts on import and skips the rest", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const hash = await chartContentHash(chart());
    const config = { userDepthCharts: { "1": { id: "round-lake-chart", contentHash: hash } } };
    const result = await saveProjectCharts([chart(), chart("other-lake-chart", "Other Lake"), { schema: "nonsense" }], config);
    expect(result).toEqual({ saved: 1, skipped: 2 });
    expect(await loadUserChart("round-lake-chart")).toBeDefined();
    // A project file cannot fill this browser with charts nothing uses.
    expect(await loadUserChart("other-lake-chart")).toBeUndefined();
    expect(await saveProjectCharts(undefined, config)).toEqual({ saved: 0, skipped: 0 });
  });
});
