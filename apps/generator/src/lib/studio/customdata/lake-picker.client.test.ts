import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartableLake } from "$lib/domain/lake-lookup";
const lookup = vi.hoisted(() => ({ near: vi.fn(), whole: vi.fn(), at: vi.fn(), view: vi.fn() }));
vi.mock("$lib/domain/lake-lookup", async importOriginal => ({ ...await importOriginal<typeof import("$lib/domain/lake-lookup")>(), lakesNear: lookup.near, wholeLake: lookup.whole, lakeAt: lookup.at, lakesInView: lookup.view }));
import { picker, mapLakes, loadVisibleLakes, lakeMapTargets, choosePlace, chooseLake, pickLakeOnMap, cancelLakePicker } from "$lib/studio/customdata/lake-picker.svelte";
import { draft, resetDraft } from "$lib/studio/customdata/chart-draft.svelte";
const place = { id: "viking", label: "Viking, MN, United States of America", lat: 48.2186364, lon: -96.4058607, type: "city" };
const lake: ChartableLake = { id: "one", name: "Round Lake", hylakId: 1, outline: [[-97, 48], [-96, 48], [-96, 49], [-97, 49]], footprint: 1, spanKm: [10, 10], distanceKm: 0, clipped: false };
afterEach(() => { cancelLakePicker(); resetDraft(); picker.lakes = []; picker.ponds = []; mapLakes.lakes = []; vi.resetAllMocks(); });
describe("lake picker", () => {
  it("exposes lake targets before searching or selecting without moving the camera", async () => {
    lookup.view.mockResolvedValue([lake]);
    const camera = picker.bounds;
    await loadVisibleLakes({ west: -97, east: -96, south: 48, north: 49 });
    expect(lakeMapTargets()).toContainEqual(lake);
    expect(draft.lake).toBeUndefined();
    expect(picker.bounds).toBe(camera);
    lookup.whole.mockResolvedValue(lake);
    await pickLakeOnMap(48.5, -96.5, lake.id);
    expect(draft.lake?.id).toBe(lake.id);
    expect(lookup.at).not.toHaveBeenCalled();
  });
  it("ignores stale viewport replies after panning", async () => {
    const old = Promise.withResolvers<ChartableLake[]>();
    lookup.view.mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ ...lake, id: "new-view" }]);
    const first = loadVisibleLakes({ west: -97, east: -96, south: 48, north: 49 });
    await loadVisibleLakes({ west: -96, east: -95, south: 48, north: 49 });
    old.resolve([lake]); await first;
    expect(mapLakes.lakes.map(item => item.id)).toEqual(["new-view"]);
  });
  it("asks for a closer view instead of loading country-wide outlines", async () => {
    await loadVisibleLakes({ west: -120, east: -90, south: 40, north: 50 });
    expect(lookup.view).not.toHaveBeenCalled();
    expect(mapLakes.note).toContain("Zoom in");
  });
  it("immediately locates a town result and explains an empty search", async () => {
    const waiting = Promise.withResolvers<{ lakes: ChartableLake[]; ponds: ChartableLake[]; surveyed: string[] }>();
    lookup.near.mockReturnValue(waiting.promise);
    const pending = choosePlace(place);
    expect(picker.chosenPlace?.id).toBe("viking");
    expect(picker.bounds!.west).toBeLessThan(place.lon);
    expect(picker.status).toContain("Viking");
    waiting.resolve({ lakes: [], ponds: [], surveyed: [] }); await pending;
    expect(picker.error).toContain("place, not a lake outline");
    expect(picker.searching).toBe(false);
  });
  it("uses the same complete outline when selecting from the map", async () => {
    picker.lakes = [lake]; lookup.whole.mockResolvedValue(lake);
    await pickLakeOnMap(48.5, -96.5);
    expect(draft.lake).toEqual(lake);
    expect(lookup.at).not.toHaveBeenCalled();
    expect(picker.activeId).toBe(lake.id);
  });
  it("selects the rendered target by ID even at a shoreline hit, without another lookup", async () => {
    picker.lakes = [lake]; lookup.whole.mockResolvedValue(lake);
    await pickLakeOnMap(49.00001, -96.5, lake.id);
    expect(draft.lake?.id).toBe(lake.id);
    expect(lookup.at).not.toHaveBeenCalled();
  });
  it("reuses a selected lake even when it was never in search results", async () => {
    draft.lake = lake; lookup.whole.mockResolvedValue(lake);
    await pickLakeOnMap(48.5, -96.5);
    expect(lookup.at).not.toHaveBeenCalled();
    expect(draft.lake?.id).toBe(lake.id);
  });
  it("looks up a map click beyond the current search and reports misses", async () => {
    lookup.at.mockResolvedValue(undefined);
    await pickLakeOnMap(40, -100);
    expect(lookup.at).toHaveBeenCalled();
    expect(picker.error).toContain("No selectable lake outline");
    expect(draft.lake).toBeUndefined();
  });
  it("does not let a cancelled outline replace a newer selection", async () => {
    const waiting = Promise.withResolvers<ChartableLake>();
    lookup.whole.mockReturnValueOnce(waiting.promise).mockResolvedValueOnce({ ...lake, id: "two" });
    const old = chooseLake(lake);
    await chooseLake({ ...lake, id: "two" });
    waiting.resolve(lake); await old;
    expect(draft.lake?.id).toBe("two");
  });
});
