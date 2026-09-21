<script lang="ts">
  import { ChevronDown, Circle, Square } from "@lucide/svelte";
  import { Section } from "@loidolt/theme-svelte";
  import { displayLength, MAX_PROJECT_DIMENSION_MM, type ProjectConfigV1 } from "@topostack/core";
  import LengthField from "$lib/studio/StudioLengthField.svelte";
  import { SHAPE_OPTIONS } from "$lib/studio/options";
  import UnitSwitch from "$lib/studio/panels/UnitSwitch.svelte";
  import { getStudio } from "$lib/studio/studio-context";

  const studio = getStudio();
  const { navigateChoice, sectionSummary, shownLength, storedLength, toggleSection, updateFabrication } = studio;
</script>

<Section class="config-section" aria-labelledby="atomm-size-title">
  <button type="button" class="section-disclosure" id="atomm-size-title" aria-expanded={studio.openSections.size} aria-controls="section-size" onclick={() => toggleSection("size")}>
    <span class="section-number">03</span>
    <span class="section-title">{studio.project.outputMode === "engraving" ? "Artwork size" : "Cut size"}<small>{sectionSummary("size")}</small></span>
    <ChevronDown size={16} class={studio.openSections.size ? "kicker-chevron kicker-chevron--open" : "kicker-chevron"} />
  </button>
  <div id="section-size" class="section-content" hidden={!studio.openSections.size}>
  {#if !studio.embeddedInPlatform}<UnitSwitch />{/if}
  <div class="ldt-toggle-group shape-switch" role="radiogroup" aria-label="Crop shape">
    {#each SHAPE_OPTIONS as option}
      <button type="button" class="ldt-toggle-group__item" role="radio" aria-checked={studio.project.cropShape === option.value} data-state={studio.project.cropShape === option.value ? "on" : "off"} tabindex={studio.project.cropShape === option.value ? 0 : -1} onclick={() => void updateFabrication({ cropShape: option.value as ProjectConfigV1["cropShape"], ...(option.value === "circle" ? { heightMm: studio.project.widthMm } : {}) })} onkeydown={navigateChoice}>{#if option.value === "rectangle"}<Square size={15} />{:else}<Circle size={15} />{/if}{option.label}</button>
    {/each}
  </div>
  <div class="field-stack">
    <LengthField label="Width" unit={studio.shownLengthUnit} value={shownLength(studio.project.widthMm)} min={studio.project.units === "imperial" ? 0.001 : 0.01} max={displayLength(MAX_PROJECT_DIMENSION_MM, studio.project.units)} step={studio.project.units === "imperial" ? 0.01 : 1} onCommit={(shown) => { const widthMm = storedLength(shown); if (widthMm !== studio.project.widthMm) void updateFabrication({ widthMm, ...(studio.project.cropShape === "circle" ? { heightMm: widthMm } : {}) }); }} />
    <LengthField label="Height" unit={studio.shownLengthUnit} value={shownLength(studio.project.heightMm)} min={studio.project.units === "imperial" ? 0.001 : 0.01} max={displayLength(MAX_PROJECT_DIMENSION_MM, studio.project.units)} step={studio.project.units === "imperial" ? 0.01 : 1} disabled={studio.project.cropShape === "circle"} onCommit={(shown) => { const heightMm = storedLength(shown); if (heightMm !== studio.project.heightMm) void updateFabrication({ heightMm }); }} />
  </div>
  </div>
</Section>
