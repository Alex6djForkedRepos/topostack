<script lang="ts">
  import { Crosshair, MapPin, Plus, Trash2 } from "@lucide/svelte";
  import { Field } from "@loidolt/theme-svelte";
  import { displayLength, MAP_MARKER_SIZE_MM, MAP_MARKER_MIN_SIZE_MM, MAP_MARKER_MAX_SIZE_MM, MAX_CUSTOM_DATA_NAME_LENGTH } from "@topostack/core";
  import NumberField from "$lib/studio/StudioNumberField.svelte";
  import LengthField from "$lib/studio/StudioLengthField.svelte";
  import { MARKER_OPTIONS } from "$lib/studio/options";
  import * as edits from "$lib/studio/project-edits";
  import { MAX_LATITUDE, MAX_LONGITUDE } from "$lib/domain/coordinates";
  import { symbolPath } from "$lib/studio/svg-path";
  import { getStudio } from "$lib/studio/studio-context";

  /**
   * Points the maker places: their coordinates, size and symbol.
   *
   * Placing one is a click on the map, so the button only has to make sure a
   * map is showing. The custom data view has its own, which is why it asks for
   * map mode rather than switching there outright.
   */

  const studio = getStudio();
  const { applyCustomDataEdit, navigateChoice, renameCustomData, shownLength, storedLength } = studio;
</script>

<div class="marker-editor">
  <div class="subgroup-heading subgroup-heading--action">
    <p><MapPin size={14} />Markers <span>{studio.project.markers.length}</span></p>
    <span class="marker-add-actions">
      <button type="button" class="marker-add-button" aria-pressed={studio.placingMarker} title="Click the map to place markers" onclick={() => { studio.placingMarker = !studio.placingMarker; if (studio.placingMarker && studio.mode !== "custom") studio.mode = "map"; }} disabled={!studio.placingMarker && !edits.canAddMarker(studio.project)}><Crosshair size={13} />{studio.placingMarker ? "Done placing" : "Place on map"}</button>
      <button type="button" class="marker-add-button" onclick={() => applyCustomDataEdit(edits.addMarker(studio.project, crypto.randomUUID()))} disabled={!edits.canAddMarker(studio.project)}><Plus size={13} />Add marker</button>
    </span>
  </div>
  {#if studio.placingMarker}
    <p class="custom-data-tool-status" role="status">Click the map to add a marker. Choose Done placing when you’re finished.</p>
  {/if}
  {#if studio.project.markers.length === 0 && !studio.placingMarker}
    <small class="marker-empty">Place markers by clicking the map, or add one and enter its latitude and longitude, then choose the symbol to engrave.</small>
  {:else}
    <div class="marker-list">
      {#each studio.project.markers as marker, index (marker.id)}
        <div class="marker-card">
          <div class="marker-card__header">
            <!-- The card is titled by its name; blank, it shows the number it is called by until one is typed. -->
            <input class="custom-data-name" type="text" value={marker.name ?? ""} maxlength={MAX_CUSTOM_DATA_NAME_LENGTH} placeholder={`Marker ${index + 1}`} aria-label={`Name for marker ${index + 1}`} oninput={(event) => renameCustomData(edits.renameMarker(studio.project, marker.id, event.currentTarget.value))} />
            <button type="button" aria-label={marker.name ? `Remove ${marker.name}` : `Remove marker ${index + 1}`} title="Remove marker" onclick={() => applyCustomDataEdit(edits.removeMarker(studio.project, marker.id))}><Trash2 size={14} /></button>
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
