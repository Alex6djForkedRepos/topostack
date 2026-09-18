<script lang="ts">
  import { Archive, ArrowUpRight, Download, FileJson, FileType, Heart, Layers3, ListOrdered, PenTool, SprayCan, X } from "@lucide/svelte";
  import { IconButton } from "@loidolt/theme-svelte";
  import type { ProjectConfigV1 } from "@topostack/core";
  import type { DownloadOption } from "./native-export";

  let { open, project, blockedReason, preparing, platformAvailable, phase, title, detail, onDownload, onClose }: {
    open: boolean;
    project: ProjectConfigV1;
    blockedReason: string | undefined;
    preparing: boolean;
    platformAvailable: boolean;
    phase: string;
    title: string;
    detail: string;
    onDownload: (option: DownloadOption) => void;
    onClose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  import { donationUrl } from "../lib/support";
  const cards = $derived([
    { id: "all", label: "Complete project", format: "ZIP", icon: Archive, description: "All artwork, project data, instructions, and source credits in one download.", featured: true },
    { id: "master", label: project.outputMode === "engraving" ? "Engraving SVG" : "Master SVG", format: "SVG", icon: FileType, description: project.outputMode === "engraving" ? "One editable map with engraving paths only." : "The full layout with separate cut, score, and engrave operations." },
    ...(project.outputMode === "stack" ? [
      { id: "panels", label: "Cut panels", format: "ZIP", icon: Layers3, description: "Individual fabrication panels with their cut, score, and engrave paths." },
      { id: "engravings", label: "Engraving panels", format: "ZIP", icon: PenTool, description: "Registered engraving-only companions for each fabrication panel." },
      { id: "paint", label: "Paint templates", format: "ZIP", icon: SprayCan, unavailable: !project.paintTemplates.length, description: project.paintTemplates.length ? "Paper stencils registered to each panel, windowed to the water that stays visible after assembly." : "Turn on Water paint templates in Fabrication settings to add paper stencils for each panel." },
      { id: "assembly", label: "Assembly guide", format: "SVG", icon: ListOrdered, description: "A visual reference for layer order and elevations as you build." },
    ] : []),
    { id: "project", label: "Project settings", format: "JSON", icon: FileJson, description: "Save your settings to import and continue later. Regenerate terrain after importing." },
  ]);

  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });

  function closeFromBackdrop(event: MouseEvent): void {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }
</script>

<dialog bind:this={dialog} class="ldt-dialog export-dialog" aria-labelledby="export-dialog-title" aria-describedby="export-dialog-description" onclose={onClose} onmousedown={closeFromBackdrop}>
  <header class="ldt-dialog__header">
    <div><span class="section-kicker">From terrain to something tangible</span><h2 id="export-dialog-title" class="ldt-dialog__title">Export your project</h2><p id="export-dialog-description" class="ldt-dialog__description">Choose the files you need for {project.name}.</p></div>
    <IconButton label="Close export dialog" onclick={() => dialog.close()}><X size={19} /></IconButton>
  </header>
  <div class="ldt-dialog__body export-dialog-body">
    {#if blockedReason}<p id="export-blocked-reason" class="export-blocked" role="status">{blockedReason} You can still save your project settings.</p>{/if}
    <div class="export-cards" aria-busy={preparing}>
      {#each cards as card (card.id)}
        <button type="button" class="export-card" class:export-card--featured={card.featured} disabled={preparing || card.unavailable || (card.id !== "project" && Boolean(blockedReason))} aria-describedby={card.id !== "project" && blockedReason ? "export-blocked-reason" : undefined} onclick={() => onDownload(card.id as DownloadOption)}>
          <span class="export-card-top"><span class="export-card-icon"><card.icon size={22} strokeWidth={1.6} /></span><span class="export-card-format">{card.format}</span></span>
          <strong>{card.label}</strong><span class="export-card-description">{card.description}</span>
          <span class="export-card-action"><Download size={14} /> Download {card.format}</span>
        </button>
      {/each}
    </div>
    <section class="export-platform" hidden={!platformAvailable} aria-label="Atomm export">
      <div><strong>Continue in xTool Studio</strong><p>Use Atomm to open your master artwork in Studio or download your files.</p></div>
      <fieldset disabled={preparing || Boolean(blockedReason)} inert={preparing || Boolean(blockedReason)} aria-label="Atomm export actions"><div data-atomm-export-button></div></fieldset>
    </section>
    {#if phase !== "idle"}
      <div class={`export-feedback export-feedback--${phase}`} role="status" aria-live="polite">
        <span class="export-feedback-indicator" aria-hidden="true"></span>
        <span class="export-feedback-copy"><strong>{title}</strong><small>{detail}</small></span>
      </div>
    {/if}
    <section class="export-support" aria-labelledby="export-support-title">
      <span class="export-support-icon"><Heart size={22} strokeWidth={1.6} /></span>
      <div class="export-support-copy"><h3 id="export-support-title">Help keep TopoStack growing</h3><p>If TopoStack has been useful to you, or you use it for commercial projects, consider a donation to support its development.</p><small>Donations are optional. Every export is available without donating.</small></div>
      {#if donationUrl}<a class="export-donate" href={donationUrl} target="_blank" rel="noopener noreferrer"><Heart size={16} strokeWidth={2} fill="currentColor" aria-hidden="true" /> Donate <ArrowUpRight size={16} aria-hidden="true" /><span class="ldt-visually-hidden"> (opens in a new tab)</span></a>{/if}
    </section>
  </div>
</dialog>
