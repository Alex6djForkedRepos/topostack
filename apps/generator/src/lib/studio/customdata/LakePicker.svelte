<script lang="ts">
  import { Button, Input } from "@loidolt/theme-svelte";
  import { Search } from "@lucide/svelte";
  import { searchPlaces, type PlaceResult } from "$lib/domain/data-provider";
  import { lakesNear, wholeLake, type ChartableLake } from "$lib/domain/lake-lookup";

  /**
   * Finding the lake a chart shows: search a place, then pick a lake near it.
   *
   * Many lakes are unnamed in the water data, so each is listed with its size
   * and how far it lies from the place searched. Picking one the search window
   * cut off loads the whole of it first, because a chart snapped onto part of a
   * shore is placed wrongly with nothing to show for it.
   */

  let { onChoose }: { onChoose: (lake: ChartableLake) => void } = $props();

  let query = $state("");
  let places = $state.raw<PlaceResult[]>([]);
  let lakes = $state.raw<ChartableLake[]>([]);
  let ponds = $state.raw<ChartableLake[]>([]);
  let surveyed = $state.raw<string[]>([]);
  let chosenPlace = $state.raw<PlaceResult | undefined>();
  let searching = $state(false);
  let searchError = $state("");
  // Each search or pick supersedes the last; an older answer arriving late is dropped.
  let request = 0;

  const canSearch = $derived(query.trim().length >= 2);

  async function search(): Promise<void> {
    if (!canSearch) return;
    const mine = ++request;
    searching = true;
    searchError = "";
    places = [];
    lakes = [];
    ponds = [];
    surveyed = [];
    try {
      const found = await searchPlaces(query);
      if (mine !== request) return;
      places = found;
      if (!found.length) searchError = "No place found by that name. Try the lake's name, or a town beside it.";
      else await choosePlace(found[0]!);
    } catch (error) {
      if (mine === request) searchError = error instanceof Error ? error.message : "Place search is unavailable.";
    } finally {
      if (mine === request) searching = false;
    }
  }

  async function choosePlace(place: PlaceResult): Promise<void> {
    const mine = ++request;
    searching = true;
    searchError = "";
    try {
      const found = await lakesNear(place);
      if (mine !== request) return;
      chosenPlace = place;
      lakes = found.lakes;
      ponds = found.ponds;
      surveyed = found.surveyed;
      if (!found.lakes.length && !found.ponds.length && !found.surveyed.length) searchError = `No mapped lake around ${place.label.split(",")[0]}. Try searching the lake itself.`;
    } catch (error) {
      if (mine === request) searchError = error instanceof Error ? error.message : "Lake outlines could not be loaded.";
    } finally {
      if (mine === request) searching = false;
    }
  }

  async function chooseLake(lake: ChartableLake): Promise<void> {
    const mine = ++request;
    searching = true;
    searchError = "";
    try {
      const whole = await wholeLake(lake);
      if (mine === request) onChoose(whole);
    } catch (error) {
      if (mine === request) searchError = error instanceof Error ? error.message : "This lake's outline could not be loaded.";
    } finally {
      if (mine === request) searching = false;
    }
  }
</script>

<p class="chart-step">Search for the lake this chart shows.</p>
<form class="chart-search" onsubmit={(event) => { event.preventDefault(); void search(); }}>
  <label class="chart-search__input"><Search size={15} /><Input aria-label="Search for a lake" bind:value={query} placeholder="Lake name, or a town beside it" boxed /></label>
  <Button variant="primary" disabled={searching || !canSearch} onclick={() => void search()}>{searching ? "Searching…" : "Search"}</Button>
</form>
{#if searchError}<p class="chart-error" role="alert">{searchError}</p>{/if}
{#if places.length > 1}
  <div class="chart-places">
    {#each places as place (place.id)}
      <button type="button" aria-pressed={chosenPlace?.id === place.id} onclick={() => void choosePlace(place)}>{place.label}</button>
    {/each}
  </div>
{/if}
{#if lakes.length}
  <p class="chart-hint">{lakes.length === 1 ? "One lake" : `${lakes.length} lakes`} near {chosenPlace?.label.split(",")[0] ?? "there"}, biggest first.</p>
  <ul class="chart-lakes">
    {#each lakes as lake (lake.id)}
      <li><button type="button" disabled={searching} onclick={() => void chooseLake(lake)}><strong>{lake.name}</strong><small>{lake.clipped ? "At least " : ""}{lake.spanKm[0].toFixed(1)} × {lake.spanKm[1].toFixed(1)} km · {lake.distanceKm < 1 ? "right there" : `${lake.distanceKm.toFixed(1)} km away`}</small></button></li>
    {/each}
  </ul>
{/if}
{#if ponds.length}
  <!-- Too small to rank among the biggest, and often unnamed: listed by how near they are. -->
  <p class="chart-hint">Small lakes on the map near {chosenPlace?.label.split(",")[0] ?? "there"}, nearest first.</p>
  <ul class="chart-lakes">
    {#each ponds as pond (pond.id)}
      <li><button type="button" disabled={searching} onclick={() => void chooseLake(pond)}><strong>{pond.name}</strong><small>{Math.round(pond.spanKm[0] * 1000)} × {Math.round(pond.spanKm[1] * 1000)} m · {pond.distanceKm < 0.5 ? "right there" : `${pond.distanceKm.toFixed(1)} km away`}</small></button></li>
    {/each}
  </ul>
{/if}
{#if surveyed.length}
  <p class="chart-hint">{surveyed.join(", ")} {surveyed.length === 1 ? "has" : "have"} a published survey and already carve{surveyed.length === 1 ? "s" : ""} from it, so {surveyed.length === 1 ? "it is" : "they are"} not listed.</p>
{/if}
