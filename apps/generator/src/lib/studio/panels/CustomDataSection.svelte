<script lang="ts">
  import { ChevronDown, FileUp, Map as MapIcon, MapPin, Plus, Route, Trash2 } from "@lucide/svelte";
  import { Field, Section } from "@loidolt/theme-svelte";
  import { displayLength, MAP_MARKER_SIZE_MM, MAP_MARKER_MIN_SIZE_MM, MAP_MARKER_MAX_SIZE_MM } from "@topostack/core";
  import NumberField from "$lib/studio/StudioNumberField.svelte";
  import LengthField from "$lib/studio/StudioLengthField.svelte";
  import { CUSTOM_LINE_OPTIONS, MARKER_OPTIONS } from "$lib/studio/options";
  import * as edits from "$lib/studio/project-edits";
  import { MAX_LATITUDE, MAX_LONGITUDE } from "$lib/domain/coordinates";
  import { symbolPath } from "$lib/studio/svg-path";
  import { getStudio } from "$lib/studio/studio-context";

  const studio = getStudio();
  const { applyCustomDataEdit, importCustomData, navigateChoice, sectionSummary, shownLength, storedLength, toggleSection } = studio;
  let geoInput: HTMLInputElement;
  let importing = $state(false);
  // Imported tracks can hold thousands of points; their editors open on request.
  const LONG_PATH_POINTS = 12;
  let expandedPaths = $state<Record<string, boolean>>({});
</script>

<Section class="config-section custom-data-section" aria-labelledby="atomm-customData-title">
  <button type="button" class="section-disclosure" id="atomm-customData-title" aria-expanded={studio.openSections.customData} aria-controls="section-custom-data" onclick={() => toggleSection("customData")}>
    <span class="section-number">06</span>
    <span class="section-title">{studio.embeddedInPlatform ? "Markers & paths" : "Custom Data"}<small>{sectionSummary("customData")}</small></span>
    <ChevronDown size={16} class={studio.openSections.customData ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
  </button>
  <div id="section-custom-data" class="section-content" hidden={!studio.openSections.customData}>
    <p class="custom-data-intro">Add your own geographic annotations. Coordinates stay attached to the project and are clipped to the selected map area during engraving.</p>

    <div class="custom-data-import">
      <button type="button" class="custom-data-import__button" onclick={() => geoInput.click()} disabled={importing || (!edits.canAddMarker(studio.project) && !edits.canAddCustomLine(studio.project))}><FileUp size={13} />{importing ? "Importing…" : "Import GPX, KML or GeoJSON"}</button>
      <input bind:this={geoInput} data-custom-import class="ldt-visually-hidden" type="file" tabindex="-1" aria-hidden="true" accept=".gpx,.kml,.geojson,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/geo+json" onchange={(event) => { const input = event.currentTarget; importing = true; void importCustomData(input.files?.[0]).finally(() => { input.value = ""; importing = false; }); }} />
      <small>Tracks and routes become trails, polygon outlines become boundaries, and waypoints become markers. Long tracks are simplified to fit.</small>
    </div>

    <div class="marker-editor">
      <div class="subgroup-heading subgroup-heading--action">
        <p><MapPin size={14} />Markers <span>{studio.project.markers.length}</span></p>
        <button type="button" class="marker-add-button" onclick={() => applyCustomDataEdit(edits.addMarker(studio.project, crypto.randomUUID()))} disabled={!edits.canAddMarker(studio.project)}><Plus size={13} />Add marker</button>
      </div>
      {#if studio.project.markers.length === 0}
        <small class="marker-empty">Add a marker, enter its latitude and longitude, then choose the symbol to engrave.</small>
      {:else}
        <div class="marker-list">
          {#each studio.project.markers as marker, index (marker.id)}
            <div class="marker-card">
              <div class="marker-card__header">
                <b>Marker {index + 1}</b>
                <button type="button" aria-label={`Remove marker ${index + 1}`} title="Remove marker" onclick={() => applyCustomDataEdit(edits.removeMarker(studio.project, marker.id))}><Trash2 size={14} /></button>
              </div>
              <div class="field-stack marker-coordinate-fields">
                <Field label="Latitude" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label={`Marker ${index + 1} latitude`} value={marker.lat} min={-MAX_LATITUDE} max={MAX_LATITUDE} step={0.0001} oninput={(event) => event.currentTarget.value !== "" && applyCustomDataEdit(edits.updateMarker(studio.project, marker.id, { lat: event.currentTarget.valueAsNumber }))} onValueChange={(lat) => lat !== marker.lat && applyCustomDataEdit(edits.updateMarker(studio.project, marker.id, { lat }))} /><em>°</em></span>{/snippet}</Field>
                <Field label="Longitude" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label={`Marker ${index + 1} longitude`} value={marker.lon} min={-MAX_LONGITUDE} max={MAX_LONGITUDE} step={0.0001} oninput={(event) => event.currentTarget.value !== "" && applyCustomDataEdit(edits.updateMarker(studio.project, marker.id, { lon: event.currentTarget.valueAsNumber }))} onValueChange={(lon) => lon !== marker.lon && applyCustomDataEdit(edits.updateMarker(studio.project, marker.id, { lon }))} /><em>°</em></span>{/snippet}</Field>
              </div>
              <LengthField label={`Marker ${index + 1} size`} fieldLabel="Size" unit={studio.shownLengthUnit} value={shownLength(marker.sizeMm ?? MAP_MARKER_SIZE_MM)} min={displayLength(MAP_MARKER_MIN_SIZE_MM, studio.project.units)} max={displayLength(MAP_MARKER_MAX_SIZE_MM, studio.project.units)} step={studio.project.units === "imperial" ? 0.01 : 0.5} onCommit={(shown) => { const sizeMm = storedLength(shown); if (sizeMm !== (marker.sizeMm ?? MAP_MARKER_SIZE_MM)) applyCustomDataEdit(edits.updateMarker(studio.project, marker.id, { sizeMm })); }} />
              <div class="marker-symbol-options" role="radiogroup" aria-label={`Marker ${index + 1} symbol`}>
                {#each MARKER_OPTIONS as option}
                  <button type="button" role="radio" aria-label={option.label} title={option.label} aria-checked={marker.symbol === option.value} data-state={marker.symbol === option.value ? "on" : "off"} tabindex={marker.symbol === option.value ? 0 : -1} onclick={() => applyCustomDataEdit(edits.updateMarker(studio.project, marker.id, { symbol: option.value }))} onkeydown={navigateChoice}>
                    <svg viewBox="-11 -11 22 22" aria-hidden="true"><path d={symbolPath(option.paths)} fill-rule="evenodd" /></svg>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
      <small class="marker-note">Markers follow the visible faces of the stack. Markers outside the selected crop remain saved but are not engraved.</small>
    </div>

    <div class="custom-line-editor">
      <div class="subgroup-heading subgroup-heading--action">
        <p><Route size={14} />Paths <span>{studio.project.customLines.length}</span></p>
        <button type="button" class="marker-add-button" onclick={() => applyCustomDataEdit(edits.addCustomLine(studio.project, crypto.randomUUID()))} disabled={!edits.canAddCustomLine(studio.project)}><Plus size={13} />Add path</button>
      </div>
      {#if studio.project.customLines.length === 0}
        <small class="marker-empty">Create a trail or boundary, then define its route with as many latitude/longitude points as needed.</small>
      {:else}
        <div class="marker-list">
          {#each studio.project.customLines as line, lineIndex (line.id)}
            <div class="marker-card custom-line-card">
              <div class="marker-card__header">
                <b>Path {lineIndex + 1}</b>
                <button type="button" aria-label={`Remove path ${lineIndex + 1}`} title="Remove path" onclick={() => applyCustomDataEdit(edits.removeCustomLine(studio.project, line.id))}><Trash2 size={14} /></button>
              </div>
              <div class="custom-line-kind-options" role="radiogroup" aria-label={`Path ${lineIndex + 1} type`}>
                {#each CUSTOM_LINE_OPTIONS as option}
                  <button type="button" role="radio" aria-checked={line.kind === option.value} data-state={line.kind === option.value ? "on" : "off"} tabindex={line.kind === option.value ? 0 : -1} onclick={() => applyCustomDataEdit(edits.updateCustomLine(studio.project, line.id, { kind: option.value }))} onkeydown={navigateChoice}>
                    {#if option.value === "trail"}<Route size={14} />{:else}<MapIcon size={14} />{/if}{option.label}
                  </button>
                {/each}
              </div>
              {#if line.points.length > LONG_PATH_POINTS && !expandedPaths[line.id]}
                <button type="button" class="custom-point-expand" aria-expanded="false" onclick={() => { expandedPaths[line.id] = true; }}><ChevronDown size={13} />Edit {line.points.length.toLocaleString()} points</button>
              {:else}
              <div class="custom-point-list">
                {#each line.points as point, pointIndex}
                  <div class="custom-point-row">
                    <div class="custom-point-heading">
                      <span>Point {pointIndex + 1}</span>
                      <button type="button" aria-label={`Remove point ${pointIndex + 1} from path ${lineIndex + 1}`} title={line.points.length <= 2 ? "A path needs at least two points" : "Remove point"} disabled={line.points.length <= 2} onclick={() => applyCustomDataEdit(edits.removeCustomLinePoint(studio.project, line.id, pointIndex))}><Trash2 size={12} /></button>
                    </div>
                    <div class="field-stack marker-coordinate-fields">
                      <Field label="Latitude" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label={`Path ${lineIndex + 1} point ${pointIndex + 1} latitude`} value={point.lat} min={-MAX_LATITUDE} max={MAX_LATITUDE} step={0.0001} oninput={(event) => event.currentTarget.value !== "" && applyCustomDataEdit(edits.updateCustomLinePoint(studio.project, line.id, pointIndex, { lat: event.currentTarget.valueAsNumber }))} onValueChange={(lat) => lat !== point.lat && applyCustomDataEdit(edits.updateCustomLinePoint(studio.project, line.id, pointIndex, { lat }))} /><em>°</em></span>{/snippet}</Field>
                      <Field label="Longitude" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label={`Path ${lineIndex + 1} point ${pointIndex + 1} longitude`} value={point.lon} min={-MAX_LONGITUDE} max={MAX_LONGITUDE} step={0.0001} oninput={(event) => event.currentTarget.value !== "" && applyCustomDataEdit(edits.updateCustomLinePoint(studio.project, line.id, pointIndex, { lon: event.currentTarget.valueAsNumber }))} onValueChange={(lon) => lon !== point.lon && applyCustomDataEdit(edits.updateCustomLinePoint(studio.project, line.id, pointIndex, { lon }))} /><em>°</em></span>{/snippet}</Field>
                    </div>
                  </div>
                {/each}
              </div>
              {/if}
              <button type="button" class="custom-point-add" onclick={() => applyCustomDataEdit(edits.addCustomLinePoint(studio.project, line.id))} disabled={!edits.canAddCustomLinePoint(studio.project, line)}><Plus size={13} />Add point</button>
            </div>
          {/each}
        </div>
      {/if}
      <small class="marker-note">Custom paths render even when built-in Trails or Boundaries are switched off.</small>
    </div>
  </div>
</Section>
