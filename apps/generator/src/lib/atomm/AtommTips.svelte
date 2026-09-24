<script lang="ts" module>
  /** Slide ids other controls can open the walkthrough on. */
  export type TipId = "place" | "layers" | "size" | "processing" | "lakes" | "export" | "assembly";
</script>

<script lang="ts">
  import { Info, X } from "@lucide/svelte";
  // Crops of what the studio itself draws, captured by scripts/dev/capture-atomm-tips.mjs.
  import assembly from "$lib/atomm/tips/assembly.webp";
  import exportView from "$lib/atomm/tips/export.webp";
  import lakes from "$lib/atomm/tips/lakes.webp";
  import layers from "$lib/atomm/tips/layers.webp";
  import place from "$lib/atomm/tips/place.webp";
  import processing from "$lib/atomm/tips/processing.webp";
  import size from "$lib/atomm/tips/size.webp";

  let { onclose }: { onclose: () => void } = $props();

  // One step per slide, as the platform's Fabrication Tips walkthrough shows
  // them: a picture of the step, a title and a short description.
  const TIPS: Array<{ id: TipId; image: string; title: string; body: string[] }> = [
    { id: "place", image: place, title: "Pick a place", body: ["Choose a location, a suggested place, or choose Edit map area to drag the selection. The terrain reloads for the new area on its own, so there is no Generate step to remember."] },
    { id: "layers", image: layers, title: "Terrain layers", body: ["The layer count follows the vertical exaggeration, cut size and material thickness. The stack uses whole sheets, at least two. Small changes can keep the same count; the Terrain layers card shows the scale actually applied."] },
    { id: "size", image: size, title: "Real-world size", body: ["Exported artwork is in millimetres at its actual size, even when the controls show inches. Check the size and your laser's kerf before cutting."] },
    { id: "processing", image: processing, title: "Processing in Studio", body: ["Set blue lines to Score and red lines to Cut. Score follows each path; Engrave fills closed shapes, so keep it for intentionally filled marks such as solid markers."] },
    { id: "lakes", image: lakes, title: "How lake depths work", body: [
      "Surveyed floors come from underwater measurements or the terrain data. Where a lake has none, its floor is modelled from the shoreline, the slopes around it and published depth estimates. Neither reflects today's water level.",
      "Depth exaggeration deepens lake floors relative to the hills. Limit depth layers caps how many sheets go below the lowest land, and Fit lake depth compresses each lake into that allowance while keeping its shoreline.",
    ] },
    { id: "export", image: exportView, title: "Check the export", body: ["In Export, set the nesting material width and height. Watch pieces arrange automatically with 3 mm margins and 2 mm spacing, or choose Use current layout to finish early. The Export view shows the file that Open in Studio sends and lists everything Download includes: every sheet, the assembly guide, the settings and the data credits."] },
    { id: "assembly", image: assembly, title: "Assembly", body: ["Keep the nested pieces with their sheets and glue from the lowest layer upward, following the assembly guide. Test-fit a small piece before cutting the whole project."] },
  ];

  let dialog: HTMLDialogElement;
  let index = $state(0);
  const tip = $derived(TIPS[index]!);

  /** Opens the walkthrough on `id`, or on the first step. */
  export function open(id?: TipId): void {
    index = Math.max(0, TIPS.findIndex((entry) => entry.id === id));
    dialog.showModal();
  }
</script>

<dialog bind:this={dialog} class="dialog atomm-tips-dialog" aria-labelledby="atomm-tips-title" {onclose}>
  <div class="dialog-header">
    <h2 id="atomm-tips-title">Fabrication tips</h2><Info size={20} class="icon" aria-hidden="true" /><span class="spacer" aria-hidden="true"></span>
    <span class="sr-only" aria-live="polite">Step {index + 1} of {TIPS.length}: {tip.title}</span>
    <button type="button" class="btn-icon btn-icon-sm" aria-label="Close fabrication tips" onclick={() => dialog.close()}><X size={16} aria-hidden="true" /></button>
  </div>
  <div class="atomm-tips-content">
  <div class="dialog-media" aria-hidden="true">
    <img src={tip.image} alt="" width="480" height="267" decoding="async" />
  </div>
  <div class="dialog-body">
    <div class="tip-slide"><h3>{tip.title}</h3>{#each tip.body as paragraph}<p>{paragraph}</p>{/each}</div>
  </div>
  </div>
  <div class="dialog-footer">
    <div class="dots" aria-hidden="true">{#each TIPS as entry, dot (entry.id)}<i aria-current={dot === index ? "true" : undefined}></i>{/each}</div>
    <span class="spacer" aria-hidden="true"></span>
    <button type="button" class="btn btn-secondary" disabled={index === 0} onclick={() => index -= 1}>Back</button>
    {#if index < TIPS.length - 1}
      <button type="button" class="btn btn-primary" onclick={() => index += 1}>Next</button>
    {:else}
      <button type="button" class="btn btn-primary" onclick={() => dialog.close()}>Done</button>
    {/if}
  </div>
</dialog>
