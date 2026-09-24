<script lang="ts">
  import { Section } from "@loidolt/theme-svelte";
  import { SHEET_NEST_LIMITS } from "@topostack/core";
  import { automaticNestProject } from "$lib/atomm/automatic-nesting";
  import LengthField from "$lib/studio/StudioLengthField.svelte";
  import { getStudio } from "$lib/studio/studio-context";
  const studio = getStudio();
  const settings = $derived(automaticNestProject(studio.project).sheetNesting!);
  function update(key: "sheetWidthMm" | "sheetHeightMm", shown: number): void {
    const value = studio.storedLength(shown);
    if (value === settings[key]) return;
    studio.updateProject({ sheetNesting: { ...settings, [key]: value } });
  }
</script>

<Section class="config-section atomm-material-size" aria-labelledby="atomm-material-title">
  <h3 id="atomm-material-title">Nesting material</h3>
  <LengthField label="Material width" fieldLabel="Width" unit={studio.shownLengthUnit} value={studio.shownLength(settings.sheetWidthMm)} min={studio.shownLength(SHEET_NEST_LIMITS.sheetMm.min)} max={studio.shownLength(SHEET_NEST_LIMITS.sheetMm.max)} step={studio.project.units === "imperial" ? 0.1 : 1} onCommit={value => update("sheetWidthMm", value)} />
  <LengthField label="Material height" fieldLabel="Height" unit={studio.shownLengthUnit} value={studio.shownLength(settings.sheetHeightMm)} min={studio.shownLength(SHEET_NEST_LIMITS.sheetMm.min)} max={studio.shownLength(SHEET_NEST_LIMITS.sheetMm.max)} step={studio.project.units === "imperial" ? 0.1 : 1} onCommit={value => update("sheetHeightMm", value)} />
  <p>Size of each sheet. Layout updates automatically with 3 mm edges and 2 mm between pieces.</p>
</Section>
