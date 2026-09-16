<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";
  import { indexLakeDirectory, lakeStudioLink, searchLakes, type IndexedLake, type LakeDirectory } from "../lib/lake-directory";
  import { lakeLocationFromSearch } from "../lib/lake-location";
  import { Map as MapIcon, Mountain, Search } from "@lucide/svelte";
  import { Button, Field, IconButton, Input } from "@loidolt/theme-svelte";
  import NumberField from "./StudioNumberField.svelte";
  import type { ProjectConfigV1 } from "@topostack/core";
  import { searchPlaces, type PlaceResult } from "../data-provider";

  let { project, presets, onChoose, onCoordinates, onClose }: { project: ProjectConfigV1; presets: PlaceResult[]; onChoose: (place: PlaceResult) => void; onCoordinates: (lat: number, lon: number) => void; onClose: () => void } = $props();
  let query = $state("");
  let results = $state.raw<PlaceResult[]>([]);
  let searchError = $state("");
  let placesLoading = $state(false);
  let dialog: HTMLDialogElement;
  let lakes = $state.raw<IndexedLake[]>([]);
  let lakesLoading = $state(true);
  let lakesFailed = $state(false);
  let lakePage = $state(1);
  const lakePageSize = 10;
  const matchedLakes = $derived(searchLakes(lakes, query));
  const lakePageCount = $derived(Math.max(1, Math.ceil(matchedLakes.length / lakePageSize)));
  const currentLakePage = $derived(Math.min(lakePage, lakePageCount));
  const shownLakes = $derived(matchedLakes.slice((currentLakePage - 1) * lakePageSize, currentLakePage * lakePageSize));
  let directoryController: AbortController | undefined;

  async function loadLakes(): Promise<void> {
    directoryController?.abort();
    const controller = new AbortController();
    directoryController = controller;
    lakesLoading = true; lakesFailed = false;
    try {
      const response = await fetch(`${base}/data/lake-depth-directory.json`, { signal: controller.signal });
      if (!response.ok) throw new Error("Lake directory unavailable");
      const data = await response.json() as LakeDirectory;
      if (data.schemaVersion !== 1 || !Array.isArray(data.lakes) || !Array.isArray(data.sources)) throw new Error("Invalid lake directory");
      const indexed = indexLakeDirectory(data);
      if (!controller.signal.aborted) lakes = indexed;
    } catch { if (!controller.signal.aborted) lakesFailed = true; }
    finally { if (!controller.signal.aborted) lakesLoading = false; }
  }

  function chooseLake(lake: IndexedLake): void {
    const search = lakeStudioLink("", lake).split("?")[1]!;
    const location = lakeLocationFromSearch(`?${search}`, project.widthMm, project.heightMm);
    if (!location) return;
    onChoose({ id: lake.id, ...location, type: "surveyed lake", surveyedLake: true });
  }

  function changeLakePage(next: number): void {
    lakePage = next;
    const summary = dialog.querySelector<HTMLElement>(".lake-search-summary");
    summary?.focus({ preventScroll: true });
    summary?.scrollIntoView({ block: "nearest" });
  }

  onMount(() => {
    dialog.showModal();
    void loadLakes();
    return () => { directoryController?.abort(); if (dialog.open) dialog.close(); };
  });

  function closeFromBackdrop(event: MouseEvent): void {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }

  function commitCoordinate(value: number, axis: "lat" | "lon"): void {
    if (!Number.isFinite(value)) return;
    if (axis === "lat") onCoordinates(Math.max(-85.0511, Math.min(85.0511, value)), project.location.lon);
    else onCoordinates(project.location.lat, Math.max(-180, Math.min(180, value)));
  }

  $effect(() => {
    const term = query.trim();
    results = []; searchError = ""; placesLoading = false;
    if (term.length < 2) { results = []; searchError = ""; return; }
    const controller = new AbortController();
    placesLoading = true;
    const timeout = window.setTimeout(() => {
      void searchPlaces(term, controller.signal).then((items) => {
        if (!controller.signal.aborted) { results = items; searchError = items.length ? "" : "No other places found."; }
      }).catch(() => {
        if (!controller.signal.aborted) searchError = "Other place search is unavailable. You can still search surveyed lakes or enter coordinates.";
      }).finally(() => { if (!controller.signal.aborted) placesLoading = false; });
    }, 300);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  });
</script>

<dialog bind:this={dialog} class="ldt-dialog ldt-dialog--lg search-modal" aria-labelledby="location-dialog-title" aria-describedby="location-dialog-description" onclose={onClose} onmousedown={closeFromBackdrop}>
  <header class="ldt-dialog__header"><div><h2 id="location-dialog-title" class="ldt-dialog__title">Choose anywhere</h2><p id="location-dialog-description" class="ldt-dialog__description">Search for a mountain, lake, park, city, or address.</p></div><IconButton label="Close dialog" onclick={() => dialog.close()}>×</IconButton></header>
  <div class="ldt-dialog__body">
    <label class="search-input"><Search size={19} /><Input autofocus aria-label="Search places" bind:value={query} oninput={() => lakePage = 1} placeholder="Lake, place or survey ID" boxed /></label>
    <div class="coordinate-row">
      <Field label="Latitude">{#snippet children({ id })}<NumberField {id} label="Latitude" min={-85.0511} max={85.0511} step={0.0001} value={project.location.lat} boxed oninput={(event) => event.currentTarget.value !== "" && commitCoordinate(event.currentTarget.valueAsNumber, "lat")} onValueChange={(value) => commitCoordinate(value, "lat")} />{/snippet}</Field>
      <Field label="Longitude">{#snippet children({ id })}<NumberField {id} label="Longitude" min={-180} max={180} step={0.0001} value={project.location.lon} boxed oninput={(event) => event.currentTarget.value !== "" && commitCoordinate(event.currentTarget.valueAsNumber, "lon")} onValueChange={(value) => commitCoordinate(value, "lon")} />{/snippet}</Field>
      <Button onclick={() => dialog.close()}>Use coordinates</Button>
    </div>
    <section class="surveyed-lake-search" aria-labelledby="surveyed-lake-search-title" aria-busy={lakesLoading}>
      <h3 id="surveyed-lake-search-title">Surveyed lakes</h3>
      {#if lakesLoading}
        <p role="status">Loading surveyed lakes…</p>
      {:else if lakesFailed}
        <p role="alert">The surveyed lake list could not load.</p><Button onclick={() => void loadLakes()}>Retry lake search</Button>
      {:else}
        <p class="lake-search-summary" tabindex="-1" role="status">{matchedLakes.length.toLocaleString("en-US")} {matchedLakes.length === 1 ? "lake or basin" : "lakes and basins"}{query.trim() ? ` matching “${query.trim()}”` : " available"}</p>
        <div class="search-results lake-search-results">
          {#each shownLakes as lake (lake.id)}
            <button class="location-option" data-lake-id={lake.id} onclick={() => chooseLake(lake)}>
              <span class="location-option__icon"><MapIcon size={17} /></span>
              <span class="location-option__copy"><strong>{lake.name}</strong><small>{lake.region} · {lake.source.name}</small><small>Survey {lake.surveyId}</small></span>
            </button>
          {/each}
        </div>
        {#if lakePageCount > 1}
          <nav class="lake-search-pagination" aria-label="Surveyed lake pages">
            <Button disabled={currentLakePage === 1} onclick={() => changeLakePage(currentLakePage - 1)}>Previous lakes</Button>
            <span>Page {currentLakePage} of {lakePageCount}</span>
            <Button disabled={currentLakePage === lakePageCount} onclick={() => changeLakePage(currentLakePage + 1)}>Next lakes</Button>
          </nav>
        {/if}
        <p class="lake-search-note">Search by name, region, source or survey ID. Depth coverage varies by lake. <a href={`${base}/guides/lake-depth-data`}>Browse the lake directory</a>.</p>
      {/if}
    </section>
    <div class="search-results">
      {#if query.trim().length >= 2}<h3>Other places</h3>{/if}
      {#each results as result (result.id)}
        <button class="location-option" onclick={() => onChoose(result)}>
          <span class="location-option__icon"><MapIcon size={17} /></span>
          <span class="location-option__copy"><strong>{result.label.split(",")[0]}</strong><small>{result.label.split(",").slice(1).join(",")}</small></span>
        </button>
      {/each}
      {#if placesLoading}<p role="status">Searching other places…</p>{:else if searchError}<p role="status">{searchError}</p>{/if}
      {#if !query}
        <section class="preset-locations" aria-labelledby="preset-locations-title">
          <h3 id="preset-locations-title">Example locations</h3>
          <div class="preset-grid">
            {#each presets as preset (preset.id)}
              <button class="location-option" onclick={() => onChoose(preset)}>
                <span class="location-option__icon"><Mountain size={19} /></span>
                <span class="location-option__copy"><strong>{preset.label.split(",")[0]}</strong><small>{preset.label.split(",").slice(1).join(",")}</small></span>
              </button>
            {/each}
          </div>
        </section>
      {/if}
    </div>
    <small class="provider-attribution">Place search by <a href="https://www.geoapify.com/" target="_blank" rel="noreferrer">Geoapify</a> · © OpenStreetMap contributors</small>
  </div>
</dialog>

<style>
  .surveyed-lake-search { margin-block: 1rem; }
  h3 { font-size: 1rem; margin-block: 0 0.5rem; }
  .lake-search-summary, .lake-search-note { font-size: 0.8125rem; line-height: 1.5; }
  .lake-search-pagination { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; justify-content: space-between; margin-block: 0.75rem; font-size: 0.8125rem; }
</style>
