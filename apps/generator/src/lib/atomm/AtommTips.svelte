<script lang="ts" module>
  /** Slide ids other controls can open the walkthrough on. */
  export type TipId = "place" | "layers" | "size" | "processing" | "lakes" | "export" | "assembly";
</script>

<script lang="ts">
  import { Info, X } from "@lucide/svelte";

  let { onclose }: { onclose: () => void } = $props();

  // One step per slide, as the platform's Fabrication Tips walkthrough shows
  // them: an illustration band, a title and a short description.
  const TIPS: Array<{ id: TipId; title: string; body: string[] }> = [
    { id: "place", title: "Pick a place", body: ["Choose a location, a suggested place, or drag the selection on the Map view. The terrain reloads for the new area on its own, so there is no Generate step to remember."] },
    { id: "layers", title: "Terrain layers", body: ["The layer count follows the vertical exaggeration, cut size and material thickness. The stack uses whole sheets, at least two. Small changes can keep the same count; the Terrain layers card shows the scale actually applied."] },
    { id: "size", title: "Real-world size", body: ["Exported artwork is in millimetres at its actual size, even when the controls show inches. Check the size and your laser's kerf before cutting."] },
    { id: "processing", title: "Processing in Studio", body: ["Set blue lines to Score and red lines to Cut. Score follows each path; Engrave fills closed shapes, so keep it for intentionally filled marks such as solid markers."] },
    { id: "lakes", title: "How lake depths work", body: [
      "Surveyed floors come from underwater measurements or the terrain data. Where a lake has none, its floor is modelled from the shoreline, the slopes around it and published depth estimates. Neither reflects today's water level.",
      "Depth exaggeration deepens lake floors relative to the hills. Limit depth layers caps how many sheets go below the lowest land, and Fit lake depth compresses each lake into that allowance while keeping its shoreline.",
    ] },
    { id: "export", title: "Check the export", body: ["The Export view shows the file that Open in Studio sends and lists everything Download includes: every sheet, the assembly guide, the settings and the data credits."] },
    { id: "assembly", title: "Assembly", body: ["Keep the nested pieces with their sheets and glue from the lowest layer upward, following the assembly guide. Test-fit a small piece before cutting the whole project."] },
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
  <div class="dialog-media" aria-hidden="true">
    <svg class="tip-art" viewBox="0 0 240 134">
      {#if tip.id === "place"}
        <path class="tip-ground" d="M20 104 L78 58 L112 82 L152 40 L220 104 Z" />
        <path class="tip-line" d="M44 104 L78 76 L104 94 L152 60 L196 104" />
        <rect class="tip-select" x="64" y="30" width="112" height="84" rx="2" />
        <path class="tip-pin" d="M120 24 c-9 0 -15 6 -15 14 c0 11 15 24 15 24 s15 -13 15 -24 c0 -8 -6 -14 -15 -14 Z" /><circle class="tip-pin-eye" cx="120" cy="38" r="5" />
      {:else if tip.id === "layers"}
        {#each [0, 1, 2, 3, 4] as step}<path class={step % 2 ? "tip-sheet tip-sheet-alt" : "tip-sheet"} d={`M${40 + step * 14} ${104 - step * 14} h${160 - step * 28} l-12 12 h-${160 - step * 28} Z`} />{/each}
      {:else if tip.id === "size"}
        <rect class="tip-sheet" x="44" y="30" width="152" height="78" rx="2" />
        <path class="tip-line" d="M44 120 h152 M44 114 v12 M196 114 v12 M208 30 v78 M202 30 h12 M202 108 h12" />
        <text class="tip-text" x="120" y="132" text-anchor="middle">300 mm</text>
        <text class="tip-text" x="226" y="73" text-anchor="middle" transform="rotate(90 226 73)">200 mm</text>
      {:else if tip.id === "processing"}
        <path class="tip-cut" d="M36 40 h168 v58 h-168 Z" />
        <path class="tip-score" d="M56 84 C84 52 108 90 132 62 S176 58 186 76" />
        <text class="tip-text tip-text-cut" x="36" y="122">Red · Cut</text>
        <text class="tip-text tip-text-score" x="204" y="122" text-anchor="end">Blue · Score</text>
      {:else if tip.id === "lakes"}
        <path class="tip-ground" d="M16 52 L60 52 L78 70 L104 88 L136 92 L166 78 L184 52 L224 52 L224 118 L16 118 Z" />
        <path class="tip-water" d="M60 52 H184 L166 78 L136 92 L104 88 L78 70 Z" />
        <path class="tip-line" d="M60 52 H184" />
      {:else if tip.id === "export"}
        <rect class="tip-sheet" x="36" y="22" width="84" height="100" rx="3" />
        <path class="tip-cut" d="M50 40 h56 v42 h-56 Z" /><path class="tip-score" d="M56 70 C70 52 84 76 100 58" />
        {#each [0, 1, 2] as row}<rect class="tip-file" x="136" y={30 + row * 30} width="72" height="22" rx="3" />{/each}
      {:else}
        {#each [0, 1, 2] as step}<path class="tip-sheet" d={`M${60 + step * 18} ${110 - step * 26} h${120 - step * 36} l-14 14 h-${120 - step * 36} Z`} />{/each}
        <path class="tip-line" d="M200 36 v56 M192 84 l8 8 l8 -8" />
      {/if}
    </svg>
  </div>
  <div class="dialog-body">
    <div class="tip-slide"><h3>{tip.title}</h3>{#each tip.body as paragraph}<p>{paragraph}</p>{/each}</div>
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
