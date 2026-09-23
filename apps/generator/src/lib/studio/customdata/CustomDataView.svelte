<script lang="ts">
  import { onDestroy } from "svelte";
  import { nav } from "$lib/studio/customdata/custom-data-nav.svelte";
  import { disposeTracer } from "$lib/studio/customdata/chart-tracing.svelte";
  import ChartCanvas from "$lib/studio/customdata/ChartCanvas.svelte";
  import MapStage from "$lib/studio/MapStage.svelte";
  import PlaceGraphicsButton from "$lib/studio/customdata/PlaceGraphicsButton.svelte";
  import { getStudio } from "$lib/studio/studio-context";

  /**
   * The workspace for data the maker brings: whatever the open sidebar section
   * works on. A depth chart is a picture to click; markers, paths and an
   * import all land on the map, so they share it. Graphics sit on the piece
   * rather than the ground, so they show the piece.
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
  {:else if nav.section === "graphics"}
    {#if studio.project.outputMode === "stack" && !studio.threeUnavailable}
      {#if studio.ThreePreview}
        {@const Three = studio.ThreePreview}
        <Three geometry={studio.geometry} exploded={studio.explodedPreview} onUnavailable={() => { studio.threeUnavailable = true; }} />
      {:else}<div class="preview-loading">Loading 3D preview…</div>{/if}
    {:else if studio.project.outputMode === "engraving"}
      {#if studio.EngravingPreview}
        {@const Engraving = studio.EngravingPreview}
        <Engraving geometry={studio.geometry} project={studio.project} cropShape={studio.sourceProject.cropShape} />
      {:else}<div class="preview-loading">Loading engraving…</div>{/if}
    {:else if studio.TwoDPreview}
      {@const TwoD = studio.TwoDPreview}
      <TwoD geometry={studio.geometry} selectedLayer={studio.selectedLayer} />
    {:else}<div class="preview-loading">Loading cut preview…</div>{/if}
    <PlaceGraphicsButton />
  {:else}
    <MapStage />
  {/if}
</div>
