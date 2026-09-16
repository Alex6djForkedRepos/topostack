<script lang="ts">
  import type { Snippet } from "svelte";
  import { Lightbulb, PanelLeftClose, PanelLeftOpen, X } from "@lucide/svelte";
  import "./atomm-workbench.css";

  let { ready, blockedReason, preparing, exportPhase, exportTitle, exportDetail, leadHeader, lead, generate, parameterHeader, parameters, preview, dialogs }: {
    ready: boolean; blockedReason?: string; preparing: boolean;
    exportPhase: string; exportTitle: string; exportDetail: string;
    leadHeader: Snippet; lead: Snippet; generate: Snippet; parameterHeader: Snippet;
    parameters: Snippet; preview: Snippet; dialogs: Snippet;
  } = $props();
  let collapsed = $state(false);
  let tips: HTMLDialogElement;
  let tipsTrigger: HTMLButtonElement;
</script>

<!-- Rendered skeleton from Atomm layout-3-generate: lead / canvas / parameters. -->
<div class="atomm-workbench gen-app" lang="en">
  <div class="gen-body">
    <aside class="gen-rail gen-rail-lead" aria-label="Generate terrain" hidden={collapsed}>
      <div class="gen-rail-header"><span class="gen-rail-title">Terrain project</span><button type="button" class="btn-plate" aria-label="Collapse generation panel" onclick={() => collapsed = true}><PanelLeftClose size={16} aria-hidden="true" /></button></div>
      <div class="gen-rail-scroll">
        <div class="gen-rail-content">{@render leadHeader()}{@render lead()}{@render generate()}</div>
      </div>
    </aside>
    <main class="gen-canvas" aria-label="Terrain canvas">
      {@render preview()}
      {#if collapsed}<button type="button" class="gen-rail-collapsed" aria-label="Expand generation panel" onclick={() => collapsed = false}><PanelLeftOpen size={16} aria-hidden="true" /></button>{/if}
      <button bind:this={tipsTrigger} type="button" class="btn-tips atomm-tips" onclick={() => tips.showModal()}><Lightbulb size={20} aria-hidden="true" />Tips</button>
    </main>
    <aside class="gen-rail gen-rail-params" aria-label="Terrain parameters">
      <div class="gen-params-header">{@render parameterHeader()}</div>
      <div class="gen-rail-scroll"><div class="gen-params-content">{@render parameters()}</div></div>
      <div class="gen-rail-footer atomm-export-footer">
        {#if blockedReason}<p class="atomm-export-note" role="status">{blockedReason}</p>{/if}
        {#if !ready}<p role="status">Connecting to Atomm…</p>{/if}
        <div data-atomm-export-button></div>
        {#if exportPhase !== "idle"}<p class="atomm-export-note" role="status" aria-live="polite" aria-busy={preparing}><strong>{exportTitle}</strong> {exportDetail}</p>{/if}
      </div>
    </aside>
  </div>
  <dialog bind:this={tips} class="dialog atomm-tips-dialog" aria-labelledby="atomm-tips-title" onclose={() => tipsTrigger.focus()}>
    <div class="dialog-header"><h2 id="atomm-tips-title">Fabrication tips</h2><button type="button" class="btn-icon btn-icon-sm" aria-label="Close fabrication tips" onclick={() => tips.close()}><X size={16} aria-hidden="true" /></button></div>
    <div class="dialog-body">
      <h3>Generate before exporting</h3><p>The bundled preview is a starting point. Choose a place and generate fresh terrain before exporting fabrication files.</p>
      <h3>Physical dimensions</h3><p>SVG artwork uses millimeters at its actual size, including when controls display inches. Verify size and kerf before cutting.</p>
      <h3>Cut and engrave</h3><p>Red lines are cuts. Blue lines and fills are engravings. SCORE and ENGRAVE remain named groups in layered artwork; both use the blue engraving color. White marker knockouts are a separate color group and need review in Studio.</p>
      <h3>Delivery</h3><p>Download includes all artwork, instructions, settings, and attribution. Open in Studio sends the master SVG. Atomm handles machine, material, processing settings, and delivery.</p>
      <h3>Assembly</h3><p>Keep nested pieces and follow the assembly guide from the lowest layer upward. Test-fit a small piece before cutting the full project.</p>
    </div>
    <div class="dialog-footer"><button type="button" class="btn btn-primary" onclick={() => tips.close()}>Done</button></div>
  </dialog>
  {@render dialogs()}
</div>
