<script lang="ts">
  import { Shapes } from "@lucide/svelte";
  import { getStudio } from "$lib/studio/studio-context";

  /**
   * Opens placement mode for uploaded graphics from a view of the piece. It
   * shows only once the project has a graphic to place, and hides while
   * placing, when the placement toolbar offers the same.
   */
  const studio = getStudio();
  const shown = $derived(Boolean(studio.project.customGraphics?.length) && !studio.placement);
</script>

{#if shown}
  <button type="button" class="preview-place-graphics" onclick={() => studio.placeGraphics()}><Shapes size={14} />Place graphics</button>
{/if}
