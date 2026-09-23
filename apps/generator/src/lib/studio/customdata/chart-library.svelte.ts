import { deleteUserChart, listUserCharts, type SavedChartSummary } from "$lib/storage/user-charts";

/**
 * The charts kept in this browser, as the custom data view lists them.
 *
 * The tracing steps add to it and the library lists it, from two components;
 * like the draft, it lives outside both so leaving the view keeps the list and
 * the last note about it.
 */
export const library = $state<{ saved: SavedChartSummary[]; note: string; error: string }>({ saved: [], note: "", error: "" });
let refresh = 0;

export async function refreshLibrary(): Promise<void> {
  const mine = ++refresh;
  library.error = "";
  try {
    const saved = await listUserCharts();
    if (mine === refresh) library.saved = saved;
  } catch {
    if (mine === refresh) library.error = "Your saved charts could not be loaded. Check that browser storage is available, then try again.";
  }
}

/**
 * Deletes a kept chart for good. A chart a lake is using stops carving it
 * first (`stopUsing`), or the project would point at nothing.
 */
export async function deleteChart(id: string, stopUsing: (() => Promise<void>) | undefined): Promise<void> {
  try {
    if (stopUsing) await stopUsing();
    await deleteUserChart(id);
    library.note = stopUsing ? "Chart deleted. Its lake uses its other depths again." : "Chart deleted.";
  } catch (error) {
    library.note = error instanceof Error ? `The chart could not be deleted: ${error.message}` : "The chart could not be deleted.";
  }
  await refreshLibrary();
}
