<script lang="ts">
  import SizeSection from "$lib/studio/panels/SizeSection.svelte";
  import TerrainSection from "$lib/studio/panels/TerrainSection.svelte";
  import DetailsSection from "$lib/studio/panels/DetailsSection.svelte";
  import CustomDataSection from "$lib/studio/panels/CustomDataSection.svelte";
  import LineworkSection from "$lib/studio/panels/LineworkSection.svelte";
  import AdvancedSection from "$lib/studio/panels/AdvancedSection.svelte";
  import { getStudio } from "$lib/studio/studio-context";

  let { openLakeDepthHelp }: { openLakeDepthHelp?: (trigger: HTMLButtonElement) => void } = $props();
  const studio = getStudio();
</script>

<SizeSection />
<TerrainSection />
<DetailsSection {openLakeDepthHelp} />
{#if !studio.embeddedInPlatform}<CustomDataSection />{/if}
<LineworkSection />
<AdvancedSection />
