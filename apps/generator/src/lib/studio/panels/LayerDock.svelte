<script lang="ts">
  import { Layers3 } from "@lucide/svelte";
  import { getStudio } from "$lib/studio/studio-context";

  const studio = getStudio();
  const { updateProject } = studio;
</script>

{#if studio.project.outputMode === "stack"}<div class="layer-dock"><div class="layer-heading"><span><Layers3 size={16} /><b>Layer {studio.selectedLayer + 1}</b> of {studio.geometry.layers.length}</span><strong>{studio.layerTicks[studio.selectedLayer]?.toLocaleString()} {studio.shownElevationUnit}</strong></div><input class="layer-range" aria-label="Selected layer" type="range" min="0" max={Math.max(0, studio.geometry.layers.length - 1)} value={studio.selectedLayer} oninput={(event) => { studio.selectedLayer = Number(event.currentTarget.value); if (studio.mode === "3d") studio.mode = "2d"; }} /><div class="layer-scale"><span>{studio.layerTicks[0]?.toLocaleString()} {studio.shownElevationUnit}</span><span>{studio.layerTicks[Math.floor(studio.layerTicks.length / 2)]?.toLocaleString()} {studio.shownElevationUnit}</span><span>{studio.layerTicks.at(-1)?.toLocaleString()} {studio.shownElevationUnit}</span></div>{#if studio.mode === "3d"}<label class="explode-control"><span>Stack</span><input aria-label="Stack separation" type="range" min="0" max="1" step="0.05" value={studio.explodedPreview} oninput={(event) => { studio.explodedDrag = Number(event.currentTarget.value); }} onchange={(event) => { studio.explodedDrag = undefined; updateProject({ explodedPreview: Number(event.currentTarget.value) }); }} /><span>Exploded</span></label>{/if}</div>{/if}
