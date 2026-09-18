<script lang="ts">
  import type { Snippet } from "svelte";
  import { Lightbulb, PanelLeftClose, PanelLeftOpen, X } from "@lucide/svelte";
  import "./atomm-workbench.css";

  let { ready, blockedReason, preparing, exportPhase, exportTitle, exportDetail, leadHeader, lead, generate, parameterHeader, parameters, preview, dialogs }: {
    ready: boolean; blockedReason?: string; preparing: boolean;
    exportPhase: string; exportTitle: string; exportDetail: string;
    leadHeader: Snippet; lead: Snippet; generate: Snippet; parameterHeader: Snippet;
    parameters: Snippet<[(trigger: HTMLButtonElement) => void]>; preview: Snippet<[(trigger: HTMLButtonElement) => void]>; dialogs: Snippet;
  } = $props();
  let collapsed = $state(false);
  let connectionSlow = $state(false);
  $effect(() => {
    if (ready) { connectionSlow = false; return; }
    const timeout = window.setTimeout(() => connectionSlow = true, 8_000);
    return () => window.clearTimeout(timeout);
  });
  let tips: HTMLDialogElement;
  let tipsTrigger: HTMLButtonElement;
  let tipsReturnFocus: HTMLButtonElement | undefined;
  let lakeDepthHeading: HTMLHeadingElement;
  function openTips(trigger: HTMLButtonElement, lakeDepth = false): void {
    tipsReturnFocus = trigger;
    tips.showModal();
    if (lakeDepth) {
      lakeDepthHeading.scrollIntoView({ block: "start" });
      lakeDepthHeading.focus({ preventScroll: true });
    } else {
      tips.querySelector(".dialog-body")?.scrollTo({ top: 0 });
    }
  }
  const openLakeDepthHelp = (trigger: HTMLButtonElement) => openTips(trigger, true);
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
      {@render preview(openLakeDepthHelp)}
      {#if collapsed}<button type="button" class="gen-rail-collapsed" aria-label="Expand generation panel" onclick={() => collapsed = false}><PanelLeftOpen size={16} aria-hidden="true" /></button>{/if}
      <button bind:this={tipsTrigger} type="button" class="btn-tips atomm-tips" onclick={(event) => openTips(event.currentTarget)}><Lightbulb size={20} aria-hidden="true" />Tips</button>
    </main>
    <aside class="gen-rail gen-rail-params" aria-label="Terrain parameters">
      <div class="gen-params-header">{@render parameterHeader()}</div>
      <div class="gen-rail-scroll"><div class="gen-params-content">{@render parameters(openLakeDepthHelp)}</div></div>
      <div class="gen-rail-footer atomm-export-footer">
        {#if blockedReason}<p class="atomm-export-note" role="status">{blockedReason}</p>{/if}
        {#if !ready}
          <p role="status">{connectionSlow ? "Atomm has not connected. Check your connection, then reload to retry." : "Connecting to Atomm…"}</p>
          {#if connectionSlow}<button type="button" class="btn btn-secondary" onclick={() => window.location.reload()}>Reload connection</button>{/if}
        {/if}
        <p class="atomm-export-note">Studio: blue lines → <strong>Score</strong>; red → <strong>Cut</strong>. Use Engrave only for filled shapes.</p>
        <div data-atomm-export-button></div>
        {#if exportPhase !== "idle"}<p class="atomm-export-note" role="status" aria-live="polite" aria-busy={preparing}><strong>{exportTitle}</strong> {exportDetail}</p>{/if}
      </div>
    </aside>
  </div>
  <dialog bind:this={tips} class="dialog atomm-tips-dialog" aria-labelledby="atomm-tips-title" onclose={() => (tipsReturnFocus?.isConnected ? tipsReturnFocus : tipsTrigger).focus()}>
    <div class="dialog-header"><h2 id="atomm-tips-title">Fabrication tips</h2><button type="button" class="btn-icon btn-icon-sm" aria-label="Close fabrication tips" onclick={() => tips.close()}><X size={16} aria-hidden="true" /></button></div>
    <div class="dialog-body">
      <h3>Generate before exporting</h3><p>The bundled preview is a starting point. Choose a place and generate fresh terrain before exporting fabrication files.</p>
      <h3>Terrain layers</h3><p>The layer count follows your exaggeration, cut size, and material thickness, with no fixed upper limit. The stack uses whole sheets, with a minimum of two. Small changes may stay within the same layer count; the terrain summary shows the scale actually applied.</p>
      <h3>Physical dimensions</h3><p>SVG artwork uses millimeters at its actual size, including when controls display inches. Verify size and kerf before cutting.</p>
      <h3>Choose processing types in Studio</h3><p>Set Blue line to Score and Red line to Cut. Score follows the paths; Engrave fills enclosed areas, including assembly outlines and closed contours. Use Engrave only for intentionally filled shapes such as solid markers. The SVG group names SCORE and ENGRAVE organize artwork; the processing choice in Atomm controls how Studio runs it. Marker clearances export as gaps in the linework, with no white processing group.</p>
      <h3>Delivery</h3><p>Download includes all artwork, instructions, settings, and attribution. Open in Studio sends the master SVG. Atomm handles machine, material, processing settings, and delivery.</p>
      <h3 bind:this={lakeDepthHeading} tabindex="-1">How lake depths work</h3>
      <p>Surveyed floors use available underwater measurements or relief in the terrain data. Gaps may be filled with estimates, so a lake can have mixed coverage. These sources do not represent today’s water level.</p>
      <p>Modeled floors estimate a basin from its shoreline, nearby land slopes, and available depth values. Include the whole lake and some surrounding land for the best estimate. A modeled floor is not a measured survey.</p>
      <p>Depth exaggeration makes the floor deeper relative to the terrain. Maximum depth changes a modeled basin. Depth coverage is automatic unless you enable Limit depth layers and choose an allowance. Fit lake depth to available layers compresses lakes into that allowance while keeping shorelines fixed. Material thickness determines which depth differences become separate layers.</p>
      <h3>Assembly</h3><p>Keep nested pieces and follow the assembly guide from the lowest layer upward. Test-fit a small piece before cutting the full project.</p>
    </div>
    <div class="dialog-footer"><button type="button" class="btn btn-primary" onclick={() => tips.close()}>Done</button></div>
  </dialog>
  {@render dialogs()}
</div>
