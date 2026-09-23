<script lang="ts">
  import type { ChartGridV1 } from "@topostack/data-contracts/chart-bathymetry";
  import ThreePreview from "$lib/studio/ThreePreview.svelte";
  import ChartDem3D from "./ChartDem3D.svelte";
  import { representativeChartGeometry } from "./chart-stack";

  let { grid, onUnavailable }: { grid: ChartGridV1; onUnavailable: () => void } = $props();
  let surfaceStyle = $state("stack");
  let exploded = $state(0.12);
  let demOpened = $state(false);
  let stackPreview = $state<{ fitView: () => void; rotateView: () => void; zoomView: (closer: boolean) => void }>();
  const geometry = $derived(representativeChartGeometry(grid));
  $effect(() => { if (surfaceStyle === "dem") demOpened = true; });
</script>

<div class="depth-viewer">
  <div class="depth-controls">
    <select class="ldt-input" aria-label="3D surface style" bind:value={surfaceStyle}>
      <option value="stack">3D stack</option><option value="dem">Shaded DEM</option>
    </select>
    {#if surfaceStyle === "stack"}
      <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" onclick={() => stackPreview?.rotateView()}>Rotate</button>
      <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" aria-label="Zoom in" onclick={() => stackPreview?.zoomView(true)}>+</button>
      <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" aria-label="Zoom out" onclick={() => stackPreview?.zoomView(false)}>−</button>
      <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" onclick={() => stackPreview?.fitView()}>Fit view</button>
      <label>Explode <input type="range" min="0" max="1" step="0.01" bind:value={exploded} aria-label="Exploded layers" /></label>
    {/if}
  </div>
  <div class="depth-3d">
    <div class="chart-renderer" hidden={surfaceStyle !== "stack"}>
      <ThreePreview {geometry} {exploded} rememberCamera={false} bind:this={stackPreview} {onUnavailable} />
    </div>
    {#if demOpened}
      <div class="chart-renderer" hidden={surfaceStyle !== "dem"}><ChartDem3D {grid} {onUnavailable} /></div>
    {/if}
  </div>
  {#if surfaceStyle === "stack"}
    <p class="chart-hint">{geometry.layers.length} representative layers · 3 mm stock · independent of project settings</p>
  {/if}
</div>

<style>
  .depth-viewer { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .depth-3d { position: relative; flex: 1; min-height: 0; overflow: hidden; }
  .chart-renderer { position: absolute; inset: 0; }
  .depth-controls { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--loidolt-border); font-size: 11px; }
  .depth-controls :global(button) { min-height: 26px; padding: 3px 7px; font-size: 10px; }
  select { width: auto; min-width: 0; max-width: 130px; min-height: 26px; padding-block: 2px; font-size: 11px; }
  label { display: flex; gap: 4px; align-items: center; margin-left: auto; }
  input { width: 70px; }
  .chart-hint { padding: 4px 8px; font-size: 11px; border-top: 1px solid var(--loidolt-border); }
</style>
