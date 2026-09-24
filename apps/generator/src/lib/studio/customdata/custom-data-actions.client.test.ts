import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT, MAX_CUSTOM_LINE_POINTS, type ProjectConfigV1 } from "@topostack/core";
import { CustomDataActions } from "$lib/studio/customdata/custom-data-actions.svelte";

const chartStorage = vi.hoisted(() => ({ loadUserChart: vi.fn(async () => ({ chart: { review: { version: 1 } } })) }));
vi.mock("$lib/storage/user-charts", () => chartStorage);

/** A stand-in for the studio: one project, its history and status line. */
function studio(start: Partial<ProjectConfigV1> = {}) {
  let project: ProjectConfigV1 = { ...DEFAULT_PROJECT, ...start };
  const host = {
    project: () => project,
    replaceProject: vi.fn((next: ProjectConfigV1) => { project = next; }),
    recordHistory: vi.fn(),
    updateFabrication: vi.fn(async (patch: Partial<ProjectConfigV1>) => { project = { ...project, ...patch }; }),
    setStatus: vi.fn(),
  };
  return { host, actions: new CustomDataActions(host), current: () => project };
}

const at = (index: number) => ({ lat: 40, lon: -105 + index * 0.01 });

describe("custom data actions", () => {
  it("adds an uploaded SVG icon as one edit and gives it to the marker that asked", async () => {
    const { actions, host, current } = studio({ markers: [{ id: "m1", lat: 42.9, lon: -122.1, symbol: "pin", sizeMm: 8 }] });
    const file = new File([`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/><text>x</text></svg>`], "hut.svg", { type: "image/svg+xml" });
    await actions.importMarkerIcon(file, "m1");
    expect(host.updateFabrication).toHaveBeenCalledTimes(1);
    const [icon] = current().markerIcons!;
    expect(icon).toMatchObject({ name: "hut" });
    expect(current().markers[0]).toMatchObject({ symbol: "custom", iconId: icon!.id });
    expect(host.setStatus).toHaveBeenLastCalledWith(expect.stringMatching(/“hut” added · Text is left out/));
    await actions.importMarkerIcon(new File(["nope"], "broken.svg"));
    expect(host.setStatus).toHaveBeenLastCalledWith(expect.stringMatching(/not a readable SVG/));
    expect(host.updateFabrication).toHaveBeenCalledTimes(1);
  });

  it("adds an uploaded SVG to the graphics library as one edit, once per drawing", async () => {
    const { actions, host, current } = studio();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>`;
    await actions.importGraphic(new File([svg], "club-logo.svg", { type: "image/svg+xml" }));
    expect(host.updateFabrication).toHaveBeenCalledTimes(1);
    expect(current().customGraphics).toEqual([expect.objectContaining({ name: "club logo" })]);
    expect(current().placedGraphics).toBeUndefined();
    expect(host.setStatus).toHaveBeenLastCalledWith(expect.stringMatching(/Graphic “club logo” added · Place it on the piece/));
    await actions.importGraphic(new File([svg], "again.svg", { type: "image/svg+xml" }));
    expect(current().customGraphics).toHaveLength(1);
    await actions.importGraphic(new File(["nope"], "broken.svg"));
    expect(host.setStatus).toHaveBeenLastCalledWith(expect.stringMatching(/not a readable SVG/));
  });

  it("keeps each armed tool to the view and section that shows its controls", () => {
    const { actions } = studio();
    actions.setPlacingMarker(true);
    actions.disarmOutside("custom", "markers");
    expect(actions.placingMarker).toBe(true);
    actions.disarmOutside("custom", "paths");
    expect(actions.placingMarker, "a marker click with the paths tools open").toBe(false);
    actions.startLineDraft();
    actions.disarmOutside("custom", "paths");
    expect(actions.lineDraft).toBeDefined();
    actions.disarmOutside("3d", "paths");
    expect(actions.lineDraft).toBeUndefined();
    // Arming one tool puts the other down.
    actions.startLineDraft();
    actions.setPlacingMarker(true);
    expect(actions.lineDraft).toBeUndefined();
  });

  it("draws a path one click at a time, ignoring a double-click's repeat and impossible points", () => {
    const { actions, host } = studio();
    actions.startLineDraft();
    actions.extendLineDraft(at(0));
    actions.extendLineDraft(at(0));
    expect(actions.lineDraft?.points).toHaveLength(1);
    actions.extendLineDraft({ lat: 89.9, lon: 0 });
    expect(actions.lineDraft?.points).toHaveLength(1);
    expect(host.setStatus).toHaveBeenCalledWith(expect.stringContaining("beyond the latitudes"));
  });

  it("keeps a path too short to finish, says why, and lands a finished one as one edit", () => {
    const { actions, host, current } = studio();
    actions.startLineDraft();
    actions.extendLineDraft(at(0));
    actions.commitLineDraft(false);
    expect(actions.lineDraft?.points, "one point is not thrown away").toHaveLength(1);
    expect(host.setStatus).toHaveBeenLastCalledWith(expect.stringContaining("at least two points"));
    actions.extendLineDraft(at(1));
    actions.commitLineDraft(true);
    expect(host.setStatus).toHaveBeenLastCalledWith(expect.stringContaining("at least three points"));
    actions.extendLineDraft(at(2));
    actions.commitLineDraft(true);
    expect(actions.lineDraft).toBeUndefined();
    expect(host.updateFabrication).toHaveBeenCalledTimes(1);
    expect(current().customLines[0]).toMatchObject({ kind: "boundary" });
    expect(current().customLines[0]!.points).toHaveLength(4);
  });

  it("stops adding points one short of the limit, so the shape can still close", () => {
    const { actions, host } = studio();
    actions.startLineDraft();
    for (let index = 0; index < MAX_CUSTOM_LINE_POINTS + 5; index += 1) actions.extendLineDraft({ lat: 40, lon: -105 + index * 1e-4 });
    expect(actions.lineDraft?.points).toHaveLength(MAX_CUSTOM_LINE_POINTS - 1);
    expect(host.setStatus).toHaveBeenLastCalledWith(expect.stringContaining("as many points"));
  });

  it("names without refreshing the preview, as one undo step", () => {
    const { actions, host, current } = studio({ markers: [{ id: "m1", lat: 40, lon: -105, symbol: "pin", sizeMm: 8 }] });
    actions.rename({ markers: [{ id: "m1", lat: 40, lon: -105, symbol: "pin", sizeMm: 8, name: "Dock" }] });
    expect(host.recordHistory).toHaveBeenCalledWith(expect.objectContaining({ markers: [expect.not.objectContaining({ name: "Dock" })] }), ["markers"]);
    expect(host.updateFabrication).not.toHaveBeenCalled();
    expect(current().markers[0]!.name).toBe("Dock");
    actions.rename(undefined);
    expect(host.recordHistory).toHaveBeenCalledTimes(1);
  });

  it("will not apply a legacy chart without review", async () => {
    chartStorage.loadUserChart.mockResolvedValueOnce({ chart: {} } as never);
    const { actions, host, current } = studio();
    await actions.useChartForLake("9092", { id: "legacy-chart", contentHash: "a".repeat(64) });
    expect(current().userDepthCharts).toBeUndefined();
    expect(host.setStatus).toHaveBeenCalledWith(expect.stringContaining("needs contour"));
  });

  it("uses a chart for a lake under its key, dropping that lake's depth override, and lets it go", async () => {
    const reference = { id: "round-lake-chart", contentHash: "a".repeat(64) };
    const { actions, current } = studio({ waterDepthOverrides: { "9092": 12, "7": 3 } });
    await actions.useChartForLake("9092", reference);
    expect(current().userDepthCharts).toEqual({ "9092": reference });
    expect(current().waterDepthOverrides, "the charted lake offers no override").toEqual({ "7": 3 });
    await actions.useChartForLake("outline:pond-chart-0001", { ...reference, id: "pond-chart-0001" });
    await actions.clearDepthChart("9092");
    expect(Object.keys(current().userDepthCharts ?? {})).toEqual(["outline:pond-chart-0001"]);
    await actions.clearDepthChart("outline:pond-chart-0001");
    expect(current().userDepthCharts, "none left is none, not an empty set").toBeUndefined();
  });
});
