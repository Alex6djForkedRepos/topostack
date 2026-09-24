<script lang="ts">
  import { depthChartLakeKey } from "@topostack/core";
  import { getStudio } from "$lib/studio/studio-context";
  import { deleteChart, library, refreshLibrary } from "$lib/studio/customdata/chart-library.svelte";

  /**
   * The charts kept in this browser, and which lake each one carves.
   *
   * Keeping a chart changes nothing; "Use for" is what attaches it to the
   * project, under its lake's key: the HydroLAKES id, or for a lake only the
   * map draws, the chart's own outline. A project can also name a chart this
   * browser does not have (a shared link, another computer); that is listed
   * too, so it can be let go rather than silently doing nothing.
   */

  const studio = getStudio();
  /** The chart whose Delete was pressed once; a second press deletes it. */
  let confirmingDelete = $state<string | undefined>();

  const projectCharts = $derived(studio.project.userDepthCharts ?? {});
  /** Lakes in the generated map, by key, so a chart in use can say whether it carves one. */
  const lakesInMap = $derived(new Map((studio.geometry.waterSurfaces ?? []).filter((surface) => surface.hylakId !== undefined).map((surface) => [String(surface.hylakId), surface.name ?? "a lake in this map"])));
  const missing = $derived(Object.entries(projectCharts).filter(([, reference]) => !library.saved.some((chart) => chart.id === reference.id)));
  let listed = $state(false);

  void refreshLibrary().finally(() => { listed = true; });

  /** What a chart in use is doing, in the maker's terms. */
  function inUseState(key: string, lakeName: string | undefined): string {
    if (lakesInMap.has(key)) return `Selected for ${lakesInMap.get(key)} · regenerate terrain after changes`;
    // A chart can be set up before its lake is framed; say so rather than claiming it carves.
    if (!key.startsWith("outline:")) return `Ready for ${lakeName ?? "its lake"} · not in this map area`;
    return `In use for ${lakeName ?? "its lake"} · carves it when it is in the map`;
  }

  async function remove(id: string): Promise<void> {
    if (confirmingDelete !== id) { confirmingDelete = id; return; }
    confirmingDelete = undefined;
    const inUse = Object.entries(projectCharts).find(([, reference]) => reference.id === id);
    await deleteChart(id, inUse ? () => studio.clearDepthChart(inUse[0]) : undefined);
  }
</script>

<div class="chart-tools">
  <div class="subgroup-heading"><p>Your charts <span>{library.saved.length}</span></p></div>
  {#if library.note}<p class="chart-hint" role="status">{library.note}</p>{/if}
  {#if library.error}<p class="chart-error" role="alert">{library.error} <button type="button" class="chart-plain-action" onclick={() => void refreshLibrary()}>Try again</button></p>{/if}
  {#if listed && !library.error && missing.length}
    <ul class="chart-saved">
      {#each missing as [key] (key)}
        <li>
          <span class="chart-saved__name"><strong>A chart this project uses</strong></span>
          <span class="chart-saved__state">Not saved in this browser. Import the project file it was exported in to bring it here.</span>
          <span class="chart-saved__actions"><button type="button" onclick={() => void studio.clearDepthChart(key)}>Stop using</button></span>
        </li>
      {/each}
    </ul>
  {/if}
  {#if !listed}<p class="chart-hint" role="status">Loading saved charts…</p>
  {:else if !library.saved.length && !library.error}
    <p class="chart-hint">Nothing kept yet. Charts you keep stay in this browser and travel inside exported project files.</p>
  {:else if library.saved.length}
    <ul class="chart-saved">
      {#each library.saved as chart (chart.id)}
        {@const key = depthChartLakeKey(chart)}
        {@const inUse = Object.entries(projectCharts).find(([, reference]) => reference.id === chart.id)}
        <li>
          <span class="chart-saved__name"><strong>{chart.name}</strong><small>{chart.savedAt ? new Date(chart.savedAt).toLocaleDateString() : ""}</small></span>
          {#if !chart.reviewed}<span class="chart-saved__state">Needs review · recreate from the source chart. Retained for export; not used for depth generation.</span>{/if}
          {#if inUse && chart.reviewed}<span class="chart-saved__state">{inUseState(inUse[0], chart.lakeName)}</span>{/if}
          <span class="chart-saved__actions">
            {#if inUse}
              <button type="button" onclick={() => void studio.clearDepthChart(inUse[0])}>Stop using</button>
            {:else}
              <button type="button" disabled={!chart.reviewed} onclick={() => void studio.useChartForLake(key, { id: chart.id, contentHash: chart.contentHash })}>Use for {chart.lakeName ?? lakesInMap.get(key) ?? "its lake"}</button>
            {/if}
            <button type="button" class="chart-saved__delete" onclick={() => void remove(chart.id)} onblur={() => { if (confirmingDelete === chart.id) confirmingDelete = undefined; }}>{confirmingDelete === chart.id ? "Delete for good?" : "Delete"}</button>
          </span>
        </li>
      {/each}
    </ul>
    <p class="chart-hint">Using a chart marks the terrain for regeneration; it is carved the next time you generate.</p>
  {/if}
</div>
