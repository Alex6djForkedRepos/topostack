<script lang="ts">
  import SizeSection from "$lib/studio/panels/SizeSection.svelte";
  import TerrainSection from "$lib/studio/panels/TerrainSection.svelte";
  import DetailsSection from "$lib/studio/panels/DetailsSection.svelte";
  import LineworkSection from "$lib/studio/panels/LineworkSection.svelte";
  import AdvancedSection from "$lib/studio/panels/AdvancedSection.svelte";
  let { openLakeDepthHelp }: { openLakeDepthHelp?: (trigger: HTMLButtonElement) => void } = $props();

  /**
   * The project's own controls. Markers, paths and file import left this list
   * for the custom data view, which shows a map to place them on; the embed
   * keeps them in its lead rail.
   */
</script>

<SizeSection />
<TerrainSection />
<DetailsSection {openLakeDepthHelp} />
<LineworkSection />
<AdvancedSection />
