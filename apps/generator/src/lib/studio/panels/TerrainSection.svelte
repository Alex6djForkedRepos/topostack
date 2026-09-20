<script lang="ts">
  import { ChevronDown, Mountain, PenTool } from "@lucide/svelte";
  import { Field, Section } from "@loidolt/theme-svelte";
  import { displayElevation, MAX_VERTICAL_EXAGGERATION, MIN_VERTICAL_EXAGGERATION } from "@topostack/core";
  import NumberField from "$lib/studio/StudioNumberField.svelte";
  import LengthField from "$lib/studio/StudioLengthField.svelte";
  import { getStudio } from "$lib/studio/studio-context";

  const studio = getStudio();
  const { sectionSummary, shownLength, storedLength, toggleSection, updateFabrication, updateVerticalExaggeration } = studio;
</script>

<Section class="config-section" aria-labelledby="atomm-terrain-title">
  <button type="button" class="section-disclosure" id="atomm-terrain-title" aria-expanded={studio.openSections.terrain} aria-controls="section-terrain" onclick={() => toggleSection("terrain")}>
    <span class="section-number">04</span>
    <span class="section-title">{studio.project.outputMode === "engraving" ? "Contour design" : "Terrain layers"}<small>{sectionSummary("terrain")}</small></span>
    <ChevronDown size={16} class={studio.openSections.terrain ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
  </button>
  <div id="section-terrain" class="section-content" hidden={!studio.openSections.terrain}>
  {#if studio.project.outputMode === "engraving"}
    <div class="range-field">
      <span class="range-field__label"><b>Contour density</b></span>
      <div class="range-field__row">
        <input type="range" aria-label="Contour density slider" min="4" max="40" step="1" value={studio.project.engravingContourCount} oninput={(event) => void updateFabrication({ engravingContourCount: Number(event.currentTarget.value) })} />
        <span class="number-input number-input--compact"><NumberField label="Contour density" value={studio.project.engravingContourCount} min={4} max={40} step={1} onValueChange={(value) => value !== studio.project.engravingContourCount && void updateFabrication({ engravingContourCount: value })} /><em>lines</em></span>
      </div>
      <small><span>4 sparse</span><span>40 detailed</span></small>
    </div>
    <div class="field-stack">
      <Field label="Index contour" class="field-row">{#snippet children({ id })}<span class="number-input"><NumberField {id} label="Index contour interval" value={studio.project.engravingIndexInterval} min={2} max={10} step={1} onValueChange={(value) => value !== studio.project.engravingIndexInterval && void updateFabrication({ engravingIndexInterval: value })} /><em>every</em></span>{/snippet}</Field>
    </div>
    <div class="relief-summary">
      <PenTool size={20} />
      <span>
        <strong>{studio.project.engravingContourCount} contour lines in one flat graphic</strong>
        <small>≈ {Math.round(displayElevation(studio.contourInterval, studio.project.units)).toLocaleString()} {studio.shownElevationUnit} apart · every {studio.project.engravingIndexInterval}th line emphasized</small>
      </span>
    </div>
  {:else}
  <div class="range-field">
    <span class="range-field__label vertical-exaggeration-heading"><b>Vertical exaggeration</b><span class="terrain-data-badge">Updates automatically</span></span>
    <div class="range-field__row">
      <input type="range" aria-label="Vertical exaggeration slider" min={MIN_VERTICAL_EXAGGERATION} max={MAX_VERTICAL_EXAGGERATION} step="0.1" value={studio.project.verticalExaggeration} oninput={(event) => updateVerticalExaggeration(Number(event.currentTarget.value))} />
      <span class="number-input number-input--compact"><NumberField label="Vertical exaggeration" value={studio.project.verticalExaggeration} min={MIN_VERTICAL_EXAGGERATION} max={MAX_VERTICAL_EXAGGERATION} step={0.1} oninput={(event) => event.currentTarget.value !== "" && updateVerticalExaggeration(event.currentTarget.valueAsNumber)} onValueChange={updateVerticalExaggeration} /><em>×</em></span>
    </div>
    <small><span>{MIN_VERTICAL_EXAGGERATION}×</span><span>{MAX_VERTICAL_EXAGGERATION}×</span></small>
  </div>
  <div class="field-stack">
    <LengthField label="Material" fieldLabel="Material thickness" unit={studio.shownLengthUnit} value={shownLength(studio.project.materialThicknessMm)} min={shownLength(0.5)} max={shownLength(25)} step={studio.project.units === "imperial" ? 0.01 : 0.1} onCommit={(shown) => { const materialThicknessMm = storedLength(shown); if (materialThicknessMm !== studio.project.materialThicknessMm) void updateFabrication({ materialThicknessMm }); }} />
  </div>
  <div class="relief-summary">
    <Mountain size={20} />
    <span>
      <strong>{Math.round(displayElevation(studio.geometry.maxElevationM - studio.geometry.minElevationM, studio.project.units)).toLocaleString()} {studio.shownElevationUnit} relief → {studio.stackLayerCount} layers, {shownLength(studio.stackLayerCount * studio.project.materialThicknessMm)} {studio.shownLengthUnit} tall</strong>
      <small>{studio.stackPlan.verticalExaggeration.toFixed(1)}× applied{studio.stackPlan.horizontalScale > 0 ? ` · scale 1:${Math.round(1 / studio.stackPlan.horizontalScale).toLocaleString()}` : ""} · ≈ {Math.round(displayElevation(studio.stackPlan.metersPerLayer, studio.project.units)).toLocaleString()} {studio.shownElevationUnit} per layer</small>
      {#if Math.abs(studio.stackPlan.verticalExaggeration - studio.project.verticalExaggeration) > 0.05}
        <small>Exaggeration rounds to whole material layers, with a minimum of two. Thinner material gives finer height steps.</small>
      {/if}
    </span>
  </div>
  {/if}
  </div>
</Section>
