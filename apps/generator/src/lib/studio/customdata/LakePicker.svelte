<script lang="ts">
  import { Button, Input } from "@loidolt/theme-svelte";
  import { Search } from "@lucide/svelte";
  import { picker, searchLakes, choosePlace, chooseLake } from "$lib/studio/customdata/lake-picker.svelte";
</script>

<p class="chart-step">Search a lake or nearby town, then choose a lake below or click it on the map.</p>
<form class="chart-search" onsubmit={(event) => { event.preventDefault(); void searchLakes(); }}>
  <label class="chart-search__input"><Search size={15} /><Input aria-label="Search for a lake" bind:value={picker.query} placeholder="Lake name, or a town beside it" boxed /></label>
  <Button variant="primary" disabled={picker.searching || picker.query.trim().length < 2} onclick={() => void searchLakes()}>{picker.searching ? "Searching…" : "Search"}</Button>
</form>
{#if picker.searching}<p class="chart-hint" role="status">{picker.status}</p>{/if}
{#if picker.error}<p class="chart-error" role="alert">{picker.error}</p>{/if}
{#if picker.places.length > 0}
  <div class="chart-places">
    {#each picker.places as place (place.id)}
      <button type="button" aria-pressed={picker.chosenPlace?.id === place.id} onclick={() => void choosePlace(place)}>{place.label}<small>{place.type ?? "Place"} · show nearby lakes</small></button>
    {/each}
  </div>
{/if}
{#if picker.lakes.length}
  <p class="chart-hint">{picker.lakes.length === 1 ? "One lake" : `${picker.lakes.length} lakes`} near {picker.chosenPlace?.label.split(",")[0] ?? "there"}, biggest first.</p>
  <ul class="chart-lakes">
    {#each picker.lakes as lake (lake.id)}
      <li><button type="button" disabled={picker.searching} onclick={() => void chooseLake(lake)}><strong>{lake.name}</strong><small>{lake.clipped ? "At least " : ""}{lake.spanKm[0].toFixed(1)} × {lake.spanKm[1].toFixed(1)} km · {lake.distanceKm < 1 ? "right there" : `${lake.distanceKm.toFixed(1)} km away`}</small></button></li>
    {/each}
  </ul>
{/if}
{#if picker.ponds.length}
  <!-- Too small to rank among the biggest, and often unnamed: listed by how near they are. -->
  <p class="chart-hint">Small lakes on the map near {picker.chosenPlace?.label.split(",")[0] ?? "there"}, nearest first.</p>
  <ul class="chart-lakes">
    {#each picker.ponds as pond (pond.id)}
      <li><button type="button" disabled={picker.searching} onclick={() => void chooseLake(pond)}><strong>{pond.name}</strong><small>{Math.round(pond.spanKm[0] * 1000)} × {Math.round(pond.spanKm[1] * 1000)} m · {pond.distanceKm < 0.5 ? "right there" : `${pond.distanceKm.toFixed(1)} km away`}</small></button></li>
    {/each}
  </ul>
{/if}
{#if picker.surveyed.length}
  <p class="chart-hint">{picker.surveyed.join(", ")} {picker.surveyed.length === 1 ? "has" : "have"} a published survey and already carve{picker.surveyed.length === 1 ? "s" : ""} from it, so {picker.surveyed.length === 1 ? "it is" : "they are"} not listed.</p>
{/if}
