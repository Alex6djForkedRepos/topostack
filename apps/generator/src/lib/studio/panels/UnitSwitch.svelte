<script lang="ts">
  import { type ProjectConfigV1 } from "@topostack/core";
  import { UNIT_OPTIONS } from "$lib/studio/options";
  import { getStudio } from "$lib/studio/studio-context";

  const studio = getStudio();
  const { navigateChoice, updateFabrication } = studio;
</script>

<div class="ldt-toggle-group unit-switch" role="radiogroup" aria-label="Display units">
  {#each UNIT_OPTIONS as option}
    <button type="button" class="ldt-toggle-group__item" role="radio" aria-checked={studio.project.units === option.value} data-state={studio.project.units === option.value ? "on" : "off"} tabindex={studio.project.units === option.value ? 0 : -1} onclick={() => void updateFabrication({ units: option.value as ProjectConfigV1["units"] })} onkeydown={navigateChoice}>{option.label}</button>
  {/each}
</div>
