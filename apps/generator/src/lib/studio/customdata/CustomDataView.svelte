<script lang="ts">
  import { Button, Input } from "@loidolt/theme-svelte";
  import { Search, Waves } from "@lucide/svelte";
  import type { UserChartBathymetryV1 } from "@topostack/data-contracts/chart-bathymetry";
  import { searchPlaces, type PlaceResult } from "$lib/domain/data-provider";
  import { lakesNear, type ChartableLake } from "$lib/domain/lake-lookup";
  import { deleteUserChart, listUserCharts, type SavedChartSummary } from "$lib/storage/user-charts";
  import { getStudio } from "$lib/studio/studio-context";
  import { draft, resetDraft } from "$lib/studio/customdata/chart-draft.svelte";
  import ChartEditor from "$lib/studio/customdata/ChartEditor.svelte";

  /**
   * The workspace for data the maker brings. Depth charts are the first thing
   * in it; markers and paths belong here in time.
   *
   * Tracing a chart and carving a lake with it are separate jobs, so this view
   * needs no terrain and no map area: a lake is found by name, a chart is
   * traced against it, and only the explicit "Use for this lake" changes the
   * project. That way a maker can build charts before they frame anything.
   */

  const studio = getStudio();
  let query = $state("");
  let places = $state.raw<PlaceResult[]>([]);
  let lakes = $state.raw<ChartableLake[]>([]);
  let chosenPlace = $state.raw<PlaceResult | undefined>();
  let searching = $state(false);
  let searchError = $state("");
  let saved = $state.raw<SavedChartSummary[]>([]);
  let libraryNote = $state("");
  let request = 0;

  const projectCharts = $derived(studio.project.userDepthCharts ?? {});
  const lakeNames = $derived(new Map(studio.geometry.waterSurfaces?.filter((surface) => surface.hylakId !== undefined).map((surface) => [String(surface.hylakId), surface.name ?? "a lake in this map"]) ?? []));

  async function refreshLibrary(): Promise<void> {
    saved = await listUserCharts();
  }
  void refreshLibrary();

  async function search(): Promise<void> {
    const mine = ++request;
    searching = true;
    searchError = "";
    places = [];
    lakes = [];
    try {
      const found = await searchPlaces(query);
      if (mine !== request) return;
      places = found;
      if (!found.length) searchError = "No place found by that name. Try the lake's name, or a town beside it.";
      else await choosePlaceLakes(found[0]!);
    } catch (error) {
      if (mine === request) searchError = error instanceof Error ? error.message : "Place search is unavailable.";
    } finally {
      if (mine === request) searching = false;
    }
  }

  async function choosePlaceLakes(place: PlaceResult): Promise<void> {
    const mine = ++request;
    searching = true;
    searchError = "";
    try {
      const found = await lakesNear(place);
      if (mine !== request) return;
      chosenPlace = place;
      lakes = found;
      if (!found.length) searchError = `No mapped lake around ${place.label.split(",")[0]}. Try searching the lake itself.`;
    } catch (error) {
      if (mine === request) searchError = error instanceof Error ? error.message : "Lake outlines could not be loaded.";
    } finally {
      if (mine === request) searching = false;
    }
  }

  function chooseLake(lake: ChartableLake): void {
    resetDraft();
    draft.lake = lake;
    draft.title = `${lake.name} depth chart`;
  }

  async function keepChart(record: UserChartBathymetryV1): Promise<void> {
    const reference = await studio.saveChartToLibrary(record);
    await refreshLibrary();
    libraryNote = `${record.lake.name ?? "Chart"} kept. Use it for a lake to carve it.`;
    void reference;
    resetDraft();
  }

  async function remove(id: string): Promise<void> {
    await deleteUserChart(id);
    await refreshLibrary();
    libraryNote = "Chart deleted.";
  }
</script>

<div class="custom-data-view">
  <header class="custom-data-view__header">
    <h2><Waves size={18} />Depth charts</h2>
    <p>Trace a printed depth chart into a lake bed. This needs no terrain: build charts whenever you like, then use one for a lake and regenerate.</p>
  </header>

  <div class="custom-data-view__body">
    <section class="chart-pick" aria-label="Choose a lake">
      {#if draft.lake}
        <p class="chart-chosen"><strong>{draft.lake.name}</strong><button type="button" onclick={resetDraft}>Choose another lake</button></p>
      {:else}
        <p class="chart-step">Find the lake this chart is of.</p>
        <form class="chart-search" onsubmit={(event) => { event.preventDefault(); void search(); }}>
          <label class="chart-search__input"><Search size={17} /><Input aria-label="Search for a lake" bind:value={query} placeholder="Lake name, or a town beside it" boxed /></label>
          <Button variant="primary" disabled={searching || query.trim().length < 2} onclick={() => void search()}>{searching ? "Searching…" : "Search"}</Button>
        </form>
        {#if searchError}<p class="chart-error" role="alert">{searchError}</p>{/if}
        {#if places.length > 1}
          <div class="chart-places">
            {#each places as place (place.id)}
              <button type="button" onclick={() => void choosePlaceLakes(place)}>{place.label}</button>
            {/each}
          </div>
        {/if}
        {#if lakes.length}
          <!-- Many lakes are unnamed in the water data, so size is what tells them apart. -->
          <p class="chart-hint">{lakes.length === 1 ? "One lake" : `${lakes.length} lakes`} near {chosenPlace?.label.split(",")[0] ?? "there"}, biggest first.</p>
          <ul class="chart-lakes">
            {#each lakes as lake (lake.id)}
              <li><button type="button" onclick={() => chooseLake(lake)}><strong>{lake.name}</strong><small>{lake.spanKm[0].toFixed(1)} × {lake.spanKm[1].toFixed(1)} km · {lake.distanceKm < 1 ? "right there" : `${lake.distanceKm.toFixed(1)} km away`}</small></button></li>
            {/each}
          </ul>
        {/if}
      {/if}
    </section>

    {#if draft.lake}
      <ChartEditor onKeep={keepChart} />
    {/if}

    <section class="chart-library" aria-label="Saved depth charts">
      <h3>Your charts</h3>
      {#if libraryNote}<p class="chart-hint" role="status">{libraryNote}</p>{/if}
      {#if !saved.length}
        <p class="chart-hint">Nothing kept yet. Charts you keep stay in this browser and travel inside exported project files.</p>
      {:else}
        <ul class="chart-saved">
          {#each saved as chart (chart.id)}
            {@const inUse = Object.entries(projectCharts).find(([, reference]) => reference.id === chart.id)}
            <li>
              <span class="chart-saved__name"><strong>{chart.name}</strong><small>{chart.savedAt ? new Date(chart.savedAt).toLocaleDateString() : ""}</small></span>
              {#if inUse}
                <!-- A chart can be set up before its lake is framed; say so rather than claiming it carves. -->
                <span class="chart-saved__state">{lakeNames.has(inUse[0]) ? `Carving ${lakeNames.get(inUse[0])}` : `Ready for ${chart.lakeName ?? "its lake"} · not in this map area`}</span>
                <button type="button" onclick={() => void studio.clearDepthChart(Number(inUse[0]))}>Stop using</button>
              {:else if chart.hylakId === undefined}
                <span class="chart-saved__state">No lake recorded</span>
              {:else}
                <button type="button" onclick={() => void studio.useChartForLake(chart.hylakId!, { id: chart.id, contentHash: chart.contentHash })}>Use for {chart.lakeName ?? lakeNames.get(String(chart.hylakId)) ?? "its lake"}</button>
              {/if}
              <button type="button" class="chart-saved__delete" onclick={() => void remove(chart.id)}>Delete</button>
            </li>
          {/each}
        </ul>
        <p class="chart-hint">Using a chart marks the terrain for regeneration; it is carved the next time you generate.</p>
      {/if}
    </section>
  </div>
</div>
