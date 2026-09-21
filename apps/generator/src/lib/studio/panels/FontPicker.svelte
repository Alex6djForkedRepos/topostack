<script lang="ts">
  import { fontEntry, labelDimensions, labelPathData, type TextFont } from "@topostack/core";
  import { FONT_SAMPLES } from "$lib/studio/font-samples";
  import { FONT_GROUPS } from "$lib/studio/options";
  import { getStudio } from "$lib/studio/studio-context";

  let { label, value, inherited, onSelect }: {
    /** Accessible name of the radio group. */
    label: string;
    /** The chosen font; undefined selects the inherited option. */
    value: TextFont | undefined;
    /** Offers a first option that follows another setting, such as the label font. */
    inherited?: { label: string; font: TextFont };
    onSelect: (font: TextFont | undefined) => void;
  } = $props();
  const { navigateChoice } = getStudio();

  const BITMAP_SAMPLE = "123m";
  function bitmapSample(font: TextFont): string {
    const style = { font, sizeMm: 3.1 };
    // Glyphs run right and down from their origin, so start the sample half its size up and left of the box centre.
    return labelPathData(BITMAP_SAMPLE, { x: -labelDimensions(BITMAP_SAMPLE, style).width / 2, y: -1.4 }, 0, 0, 0, style);
  }
</script>

{#snippet sample(font: TextFont)}
  {@const kind = fontEntry(font).kind}
  {#if kind === "bitmap"}
    <svg viewBox="-8.5 -2.1 17 4.2" aria-hidden="true"><path stroke-linecap={font === "rounded" ? "round" : "butt"} stroke-linejoin={font === "rounded" ? "round" : "miter"} d={bitmapSample(font)} /></svg>
  {:else}
    {@const typeface = FONT_SAMPLES[font]!}
    <!-- Samples are cap height 20 from the cap line, so leave room for descenders below. -->
    <svg viewBox="-4 -7 {typeface.width + 8} 34" aria-hidden="true" class:font-sample--filled={kind === "outline"}><path d={typeface.d} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
  {/if}
{/snippet}

{#snippet choice(font: TextFont | undefined, name: string, shown: TextFont)}
  {@const selected = value === font}
  <button type="button" role="radio" aria-checked={selected} data-state={selected ? "on" : "off"} tabindex={selected ? 0 : -1} onclick={() => onSelect(font)} onkeydown={navigateChoice}>
    {@render sample(shown)}
    <span>{name}</span>
  </button>
{/snippet}

<div class="font-picker" role="radiogroup" aria-label={label}>
  {#if inherited}
    <div class="swatch-options font-options">{@render choice(undefined, inherited.label, inherited.font)}</div>
  {/if}
  {#each FONT_GROUPS as group (group.kind)}
    <p class="font-group-heading" title={group.hint}>{group.label}<small>{group.hint}</small></p>
    <div class="swatch-options font-options">
      {#each group.fonts as entry (entry.id)}{@render choice(entry.id, entry.name, entry.id)}{/each}
    </div>
  {/each}
</div>
