<script lang="ts">
  import { ChevronDown, Map as MapIcon, PenLine, Plus, Route, Trash2 } from "@lucide/svelte";
  import { Field } from "@loidolt/theme-svelte";
  import { MAX_CUSTOM_DATA_NAME_LENGTH } from "@topostack/core";
  import NumberField from "$lib/studio/StudioNumberField.svelte";
  import { CUSTOM_LINE_OPTIONS } from "$lib/studio/options";
  import * as edits from "$lib/studio/project-edits";
  import { MAX_LATITUDE, MAX_LONGITUDE } from "$lib/domain/coordinates";
  import { getStudio } from "$lib/studio/studio-context";

  /**
   * Trails and boundaries: drawn by clicking the map, or typed point by point.
   *
   * A drawn path is a trail unless it is closed, which makes it a boundary.
   * Drawing needs a map to click, so the button only makes sure one is showing;
   * the custom data view has its own.
   */

  const studio = getStudio();
  const { applyCustomDataEdit, navigateChoice, renameCustomData } = studio;
  const drawing = $derived(studio.lineDraft !== undefined);
  const points = $derived(studio.lineDraft?.points.length ?? 0);
  // Imported tracks can hold thousands of points; their editors open on request.
  const LONG_PATH_POINTS = 12;
  let expandedPaths = $state<Record<string, boolean>>({});
</script>

<div class="custom-line-editor">
  <div class="subgroup-heading subgroup-heading--action">
    <p><Route size={14} />Paths <span>{studio.project.customLines.length}</span></p>
    <span class="marker-add-actions">
      <button type="button" class="marker-add-button" aria-pressed={drawing} title="Click the map to draw a path" onclick={() => { if (drawing) { studio.commitLineDraft(false); return; } studio.startLineDraft(); if (studio.mode !== "custom") studio.mode = "map"; }} disabled={drawing ? points < 2 : !edits.canAddCustomLine(studio.project)}><PenLine size={13} />{drawing ? "Finish path" : "Draw on map"}</button>
      <button type="button" class="marker-add-button" onclick={() => applyCustomDataEdit(edits.addCustomLine(studio.project, crypto.randomUUID()))} disabled={!edits.canAddCustomLine(studio.project)}><Plus size={13} />Add path</button>
    </span>
  </div>
  {#if drawing}
    <small class="custom-data-tool-status" role="status">
      {#if points === 0}Click the map where the path starts.
      {:else if points === 1}First point placed. Click the next point on your route.
      {:else if points < 3}{points} points placed. Double-click or press Enter to finish a trail; from three points, clicking the first one closes a boundary.
      {:else}{points} points placed. Click the first point to close a boundary, or double-click or press Enter to finish a trail.
      {/if}
      <button type="button" class="chart-plain-action" onclick={() => studio.cancelLineDraft()}>Cancel drawing</button>
    </small>
  {/if}
  {#if studio.project.customLines.length === 0}
    <small class="marker-empty">Draw a trail or boundary on the map, or add one and type its latitude and longitude points.</small>
  {:else}
    <div class="marker-list">
      {#each studio.project.customLines as line, lineIndex (line.id)}
        <div class="marker-card custom-line-card">
          <div class="marker-card__header">
            <input class="custom-data-name" type="text" value={line.name ?? ""} maxlength={MAX_CUSTOM_DATA_NAME_LENGTH} placeholder={`Path ${lineIndex + 1}`} aria-label={`Name for path ${lineIndex + 1}`} oninput={(event) => renameCustomData(edits.renameCustomLine(studio.project, line.id, event.currentTarget.value))} />
            <button type="button" aria-label={line.name ? `Remove ${line.name}` : `Remove path ${lineIndex + 1}`} title="Remove path" onclick={() => applyCustomDataEdit(edits.removeCustomLine(studio.project, line.id))}><Trash2 size={14} /></button>
          </div>
          <div class="custom-line-kind-options" role="radiogroup" aria-label={`Path ${lineIndex + 1} type`}>
            {#each CUSTOM_LINE_OPTIONS as option}
              <button type="button" role="radio" aria-checked={line.kind === option.value} data-state={line.kind === option.value ? "on" : "off"} tabindex={line.kind === option.value ? 0 : -1} onclick={() => applyCustomDataEdit(edits.updateCustomLine(studio.project, line.id, { kind: option.value }))} onkeydown={navigateChoice}>
                {#if option.value === "trail"}<Route size={14} />{:else}<MapIcon size={14} />{/if}{option.label}
              </button>
            {/each}
          </div>
          {#if line.points.length > LONG_PATH_POINTS}
            <button type="button" class="custom-point-expand" aria-expanded={!!expandedPaths[line.id]} aria-controls={`path-points-${line.id}`} onclick={() => { expandedPaths[line.id] = !expandedPaths[line.id]; }}><ChevronDown size={13} class={expandedPaths[line.id] ? "kicker-chevron--open" : ""} />{expandedPaths[line.id] ? "Hide" : "Edit"} {line.points.length.toLocaleString()} points</button>
          {/if}
          <div id={`path-points-${line.id}`}>
          {#if line.points.length <= LONG_PATH_POINTS || expandedPaths[line.id]}
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
          </div>
          <button type="button" class="custom-point-add" onclick={() => applyCustomDataEdit(edits.addCustomLinePoint(studio.project, line.id))} disabled={!edits.canAddCustomLinePoint(studio.project, line)}><Plus size={13} />Add point</button>
        </div>
      {/each}
    </div>
  {/if}
  <small class="marker-note">Custom paths render even when built-in Trails or Boundaries are switched off.</small>
</div>
