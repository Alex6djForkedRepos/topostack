<script lang="ts">
  import { base } from "$app/paths";
  import { Box, Layers3, Map as MapIcon, PenTool, Waves, X } from "@lucide/svelte";
  import { Button } from "@loidolt/theme-svelte";
  import { displayElevation, type GeoBounds } from "@topostack/core";
  import FeedbackButton from "$lib/site/FeedbackButton.svelte";
  import { featuredLayerIndex } from "$lib/studio/preview-summary";
  import * as edits from "$lib/studio/project-edits";
  import LakeDepthHelp from "$lib/studio/panels/LakeDepthHelp.svelte";
  import LayerDock from "$lib/studio/panels/LayerDock.svelte";
  import { MAP_DATA_ATTRIBUTION } from "$lib/domain/map-attribution";
  import { getStudio, type PreviewMode } from "$lib/studio/studio-context";

  let { openLakeDepthHelp }: { openLakeDepthHelp?: (trigger: HTMLButtonElement) => void } = $props();
  const studio = getStudio();
  // Lazily loaded previews are rendered as tags, which need a local binding.
  const MapCanvas = $derived(studio.MapCanvas);
  const EngravingPreview = $derived(studio.EngravingPreview);
  const TwoDPreview = $derived(studio.TwoDPreview);
  const ThreePreview = $derived(studio.ThreePreview);
  const { applyCustomDataEdit, cancelGeneration, dismissPreviewWarning, getFeedbackContext, navigateChoice, shownLength, updateFabrication, updateLocation } = studio;
  const OSM_ATTRIBUTION = MAP_DATA_ATTRIBUTION.find((entry) => entry.name === "OpenStreetMap contributors") ?? { name: "OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" };
</script>

<section class="preview-panel" class:engraving-preview-panel={studio.project.outputMode === "engraving"}>
  <div class="preview-toolbar"><div class="ldt-toggle-group mode-switch" role="radiogroup" aria-label="Preview mode">{#each studio.previewModeOptions as option}<button type="button" class="ldt-toggle-group__item" role="radio" aria-checked={studio.mode === option.value} data-state={studio.mode === option.value ? "on" : "off"} tabindex={studio.mode === option.value ? 0 : -1} onclick={() => { if (option.value === "2d" && studio.selectedLayer === 0) studio.selectedLayer = featuredLayerIndex(studio.geometry); studio.previewNotice = ""; if (option.value === "3d") studio.threeUnavailable = false; studio.mode = option.value as PreviewMode; }} onkeydown={navigateChoice}>{#if option.value === "map"}<MapIcon size={15} />{:else if option.value === "engraving"}<PenTool size={15} />{:else if option.value === "2d"}<Layers3 size={15} />{:else}<Box size={15} />{/if}{studio.embeddedInPlatform ? option.value === "2d" ? "2D" : option.value === "3d" ? "3D" : option.label : option.label}</button>{/each}</div><div class="preview-readout"><span>{shownLength(studio.project.widthMm)} × {shownLength(studio.project.heightMm)} {studio.shownLengthUnit}</span><span>{Math.round(displayElevation(studio.geometry.minElevationM, studio.project.units)).toLocaleString()}–{Math.round(displayElevation(studio.geometry.maxElevationM, studio.project.units)).toLocaleString()} {studio.shownElevationUnit}</span></div></div>
  <div class="preview-stage" aria-busy={studio.previewBusy} data-road-markings={studio.detailCounts.road} data-trail-markings={studio.detailCounts.trail} data-transportation-label-markings={studio.detailCounts.transportationLabel} data-water-markings={studio.detailCounts.water} data-contour-markings={studio.detailCounts.contour} data-alignment-markings={studio.detailCounts.alignment} data-elevation-markings={studio.detailCounts.elevation} data-north-markings={studio.detailCounts.north} data-scale-markings={studio.detailCounts.scale} data-marker-markings={studio.detailCounts.marker} data-custom-line-markings={studio.detailCounts.customLine}>{#if !studio.embeddedInPlatform}<FeedbackButton edge getContext={getFeedbackContext} />{/if}{#if studio.mode === "map"}{#if studio.MapCanvas}<MapCanvas project={studio.project} bind:aspectLocked={studio.mapAspectLocked} placingMarker={studio.placingMarker} onPlaceMarker={(lat, lon) => { const patch = edits.addMarkerAt(studio.project, crypto.randomUUID(), { lat, lon }); if (!patch) { studio.placingMarker = false; return; } applyCustomDataEdit(patch); if (!edits.canAddMarker({ markers: patch.markers })) studio.placingMarker = false; }} onMoveMarker={(id, lat, lon) => { const patch = edits.updateMarker(studio.project, id, { lat, lon }); applyCustomDataEdit(patch); return patch !== undefined; }} onStopPlacing={() => { studio.placingMarker = false; }} onSelectionResize={(widthMm, heightMm, bounds) => { void updateFabrication({ widthMm, heightMm, location: { ...studio.project.location, bounds } }); }} onUnavailable={(reason) => { studio.mode = studio.project.outputMode === "engraving" ? "engraving" : "2d"; studio.previewNotice = reason === "load-failed" ? "Map could not load · check your connection or choose a location using search or coordinates" : "Map is unavailable in this browser · choose a location using search or coordinates"; }} onLocationChange={(lat: number, lon: number, zoom: number, bounds: GeoBounds) => updateLocation({ lat, lon, zoom, bounds, label: `${lat.toFixed(4)}, ${lon.toFixed(4)}` })} />{:else}<div class="preview-loading">Loading map…</div>{/if}{:else if studio.mode === "engraving"}{#if studio.EngravingPreview}<EngravingPreview geometry={studio.geometry} project={studio.project} cropShape={studio.sourceProject.cropShape} />{:else if studio.engravingPreview.failed}<div class="preview-loading preview-load-failed" role="alert">Engraving preview could not load<button type="button" class="btn btn-secondary" onclick={() => studio.engravingPreview.load()}>Retry</button></div>{:else}<div class="preview-loading">Loading engraving…</div>{/if}{:else if studio.mode === "2d"}{#if studio.TwoDPreview}<TwoDPreview geometry={studio.geometry} selectedLayer={studio.selectedLayer} />{:else if studio.twoDPreview.failed}<div class="preview-loading preview-load-failed" role="alert">Cut preview could not load<button type="button" class="btn btn-secondary" onclick={() => studio.twoDPreview.load()}>Retry</button></div>{:else}<div class="preview-loading">Loading cut preview…</div>{/if}{:else if studio.ThreePreview}<ThreePreview geometry={studio.geometry} exploded={studio.explodedPreview} onUnavailable={() => { studio.threeUnavailable = true; studio.mode = "2d"; studio.previewNotice = "3D is unavailable in this browser · showing cut layers"; }} />{:else}<div class="preview-loading">Loading 3D preview…</div>{/if}{#if studio.mode !== "map"}<div class="preview-attribution">Map data © <a href={OSM_ATTRIBUTION.url} target="_blank" rel="noreferrer">{OSM_ATTRIBUTION.name}</a> · <a href={`${base}/attribution${import.meta.env.VITE_SITE_ENV === "atomm" ? ".html" : ""}`} target="_blank" rel="noopener noreferrer">All sources<span class="ldt-visually-hidden"> (opens in a new tab)</span></a></div>{/if}{#if studio.previewBusy}<div class:preview-update-overlay={studio.detailsUpdating && studio.generationState !== "loading"} class="generation-overlay" role="status" aria-live="polite" style:pointer-events={studio.detailsUpdating && studio.generationState !== "loading" ? "none" : undefined}><div class="contour-loader" aria-hidden="true"><span></span><span></span><span></span></div><strong>{studio.previewBusyLabel}</strong><small>{studio.status}</small>{#if studio.generationState === "loading"}<span class="generation-step">Step {studio.generationStep} of 3</span>{/if}{#if studio.embeddedInPlatform && studio.generationState === "loading"}<button type="button" class="btn btn-secondary" onclick={cancelGeneration}>Cancel generation</button>{/if}</div>{/if}{#if studio.visibleWarnings.length || studio.previewNotice || studio.lakeDepthFittingOn}
      <div class="warning-stack">
        {#if studio.lakeDepthFittingOn}
          <div class="preview-warning preview-notice" role="status">
            <span class="warning-icon" aria-hidden="true"><Waves size={12} /></span>
            <p>Lake depth fitting is on. <Button class="warning-action" disabled={studio.previewBusy} onclick={() => void updateFabrication({ fitLakeDepth: false })}>Use manual depth</Button></p>
          </div>
        {/if}
        {#if studio.previewNotice}
          <div class="preview-warning preview-notice" role="status">
            <span class="warning-icon" aria-hidden="true">!</span>
            <p>{studio.previewNotice}</p>
            <button type="button" class="warning-dismiss" aria-label={`Dismiss notice: ${studio.previewNotice}`} title="Dismiss notice" onclick={(event) => dismissPreviewWarning(event)}><X size={14} aria-hidden="true" /></button>
          </div>
        {/if}
        {#each studio.visibleWarnings as warning (`${warning.code}-${warning.message}`)}
          <div class="preview-warning">
            <span class="warning-icon" aria-hidden="true">!</span>
            <p>{warning.message}{#if warning.code === "LAKE_DEPTH_PREDICTED"}&nbsp;<LakeDepthHelp {openLakeDepthHelp} />{/if}{#if warning.action === "fit-lake-depth" && !studio.project.fitLakeDepth} <Button class="warning-action" disabled={studio.previewBusy} onclick={() => void updateFabrication({ fitLakeDepth: true })}>Fit depth</Button>{/if}</p>
            <button type="button" class="warning-dismiss" aria-label={`Dismiss warning: ${warning.message}`} title="Dismiss warning" onclick={(event) => dismissPreviewWarning(event, `${warning.code}-${warning.message}`)}><X size={14} aria-hidden="true" /></button>
          </div>
        {/each}
      </div>
    {/if}</div>
  {#if !studio.embeddedInPlatform}<LayerDock />{/if}
</section>
