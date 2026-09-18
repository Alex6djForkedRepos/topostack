<script lang="ts">
  import SvgViewport from "./SvgViewport.svelte";
  import { displayElevation, elevationUnit, labelPathData, type GeometryIRV1 } from "@topostack/core";
  import { markingColor, markingDash, markingWidth } from "./marking-style";
  import { markingPath, pointsToPath } from "./svg-path";
  let { geometry, selectedLayer }: { geometry: GeometryIRV1; selectedLayer: number } = $props();
  const layer = $derived(geometry.layers[selectedLayer] ?? geometry.layers[0]);
  // Every sheet at or below the waterline sits under water, so the tint marks
  // which part of this sheet the basin covers.
  const submerged = $derived((geometry.waterSurfaces ?? []).filter((surface) => (layer?.index ?? 0) <= surface.layerIndex));
</script>

{#if layer}
  <div class="two-d-stage">
    <SvgViewport widthMm={geometry.widthMm} heightMm={geometry.heightMm} label="cut" svgLabel={`Cut preview for layer ${layer.index + 1}`} controlsLabel="Cut layers zoom controls" resetLabel="Reset cut view">
      <defs><filter id="paper-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.2" /></filter></defs>
      <g data-preview-shadow filter="url(#paper-shadow)">
        {#each layer.polygons as polygon}
          <!-- Each ring is walked once: the fill and the stroke reuse the same path. -->
          {@const outline = `${pointsToPath(polygon.outer)} Z`}
          {@const holes = polygon.holes.map((hole) => `${pointsToPath(hole)} Z`)}
          <g>
            <path d={`${outline} ${holes.join(" ")}`} fill="#e7c391" stroke="none" fill-rule="evenodd" />
            <path d={outline} fill="none" stroke="#ca5425" stroke-width="0.45" />
            {#each holes as hole}
              <path d={hole} fill="none" stroke="#ca5425" stroke-width="0.45" />
            {/each}
          </g>
        {/each}
      </g>
      {#each submerged as surface (surface.id)}
        {#each surface.polygons as polygon}
          <path d={`${pointsToPath(polygon.outer)} Z ${polygon.holes.map((hole) => `${pointsToPath(hole)} Z`).join(" ")}`} fill="#7fb2cc" fill-opacity="0.38" stroke="none" fill-rule="evenodd" />
        {/each}
      {/each}
      {#each layer.markings as marking (marking.id)}
        <g data-marking-id={marking.id} data-marking-kind={marking.kind} data-transportation-class={marking.transportationClass}><path d={markingPath(marking)} fill-rule="evenodd" fill={marking.knockout ? "#e7c391" : marking.filled ? markingColor(marking) : "none"} stroke={marking.filled ? "none" : markingColor(marking)} stroke-width={markingWidth(marking, geometry.lineStyle)} stroke-dasharray={markingDash(marking, geometry.lineStyle)} stroke-linecap={marking.kind === "road" ? geometry.lineStyle.roadCap : marking.kind === "grid" ? "round" : undefined} stroke-linejoin={marking.kind === "road" ? "round" : undefined} />{#if marking.label && marking.points[0]}<path d={labelPathData(marking.label, marking.points[0], 0, 0, marking.labelRotationRad, marking.textStyle)} fill="none" stroke={markingColor(marking)} stroke-width={geometry.lineStyle.annotationMm} stroke-linecap={marking.textStyle?.font === "rounded" ? "round" : "butt"} stroke-linejoin={marking.textStyle?.font === "rounded" ? "round" : "miter"} />{/if}</g>
      {/each}
    </SvgViewport>
    <div class="axis layer-elevation">{Math.round(displayElevation(layer.elevationM, geometry.units)).toLocaleString()} {elevationUnit(geometry.units)}</div>
  </div>
{/if}
