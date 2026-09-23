<script lang="ts">
  import { onDestroy } from "svelte";
  import { nav } from "$lib/studio/customdata/custom-data-nav.svelte";
  import { disposeTracer } from "$lib/studio/customdata/chart-tracing.svelte";
  import ChartCanvas from "$lib/studio/customdata/ChartCanvas.svelte";
  import MapStage from "$lib/studio/MapStage.svelte";
  import { getStudio } from "$lib/studio/studio-context";

  /**
   * The workspace for data the maker brings: whatever the open sidebar section
   * works on. A depth chart is a picture to click; markers, paths and an
   * import all land on the map, so they share it.
   *
   * The trace worker outlives no view: the draft survives leaving this one,
   * but the worker is started again on the next trace.
   */

  onDestroy(disposeTracer);
  const studio = getStudio();
</script>

<div class="custom-data-view">
  {#if nav.section === "charts" && studio.project.outputMode !== "engraving"}
    <ChartCanvas />
  {:else}
    <MapStage />
  {/if}
</div>
