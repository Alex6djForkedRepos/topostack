<script lang="ts">
  import type { LocatorMap } from "$lib/site/lake-locator";

  let { map, name, place }: { map: LocatorMap; name: string; place: string } = $props();

  // One path of zero-length segments with round caps draws every dot in a few bytes each.
  const dots = $derived(map.dots.map(([x, y]) => `M${x} ${y}h0`).join(""));
</script>

<figure class="locator">
  <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-labelledby="locator-title">
    <title id="locator-title">Map of where {name} is in {place}, about {map.widthKm.toLocaleString("en-US")} km across</title>
    <rect class="sea" width={map.width} height={map.height} />
    <path class="land" d={map.land} />
    <path class="water" d={map.lakes} />
    <path class="states" d={map.states} />
    <path class="countries" d={map.countries} />
    <path class="dots" d={dots} />
    <rect class="survey" x={map.box.x} y={map.box.y} width={Math.max(map.box.width, 0.5)} height={Math.max(map.box.height, 0.5)} />
    {#if map.marker}
      <circle class="halo" cx={map.marker.x} cy={map.marker.y} r="7" />
      <circle class="marker" cx={map.marker.x} cy={map.marker.y} r="3.5" />
    {/if}
    <path class="scale" d={`M10 ${map.height - 12}h${map.scale.length}`} />
    <text class="scale-label" x="10" y={map.height - 17}>{map.scale.km.toLocaleString("en-US")} km</text>
  </svg>
  <figcaption>The orange {map.marker ? "marker" : "outline"} is the survey area; dots are other lakes with depth data. Map data: Natural Earth.</figcaption>
</figure>

<style>
  .locator { margin: 24px 0 8px; }
  svg { display: block; width: 100%; height: auto; border: 1px solid var(--loidolt-border); border-radius: var(--loidolt-border-radius); overflow: hidden; }
  .sea, .water { fill: color-mix(in srgb, #3f84c4 22%, var(--loidolt-background)); }
  .land { fill: var(--loidolt-surface); }
  .states, .countries { fill: none; stroke: var(--loidolt-text-muted); stroke-linejoin: round; }
  .states { stroke-width: 0.5; stroke-dasharray: 2 2; opacity: 0.6; }
  .countries { stroke-width: 0.9; opacity: 0.8; }
  .dots { fill: none; stroke: color-mix(in srgb, #3f84c4 75%, var(--loidolt-text)); stroke-width: 2.6; stroke-linecap: round; opacity: 0.7; }
  .survey { fill: var(--loidolt-accent); fill-opacity: 0.15; stroke: var(--loidolt-accent); stroke-width: 1.5; }
  .halo { fill: none; stroke: var(--loidolt-accent); stroke-width: 1.5; opacity: 0.6; }
  .marker { fill: var(--loidolt-accent); stroke: var(--loidolt-background); stroke-width: 1; }
  .scale { stroke: var(--loidolt-text); stroke-width: 1.5; }
  .scale-label { fill: var(--loidolt-text); font-size: 10px; font-family: var(--loidolt-font-utility); paint-order: stroke; stroke: var(--loidolt-surface); stroke-width: 3px; stroke-linejoin: round; }
</style>
