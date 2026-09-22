<script lang="ts">
  import { ChevronDown, Link, RotateCcw, Undo2, Redo2, Upload } from "@lucide/svelte";
  import { IconButton, Input } from "@loidolt/theme-svelte";
  import { MAX_PROJECT_NAME_LENGTH } from "@topostack/core";
  import HeaderMenu from "$lib/studio/panels/HeaderMenu.svelte";
  import { getStudio } from "$lib/studio/studio-context";

  const studio = getStudio();
  const { copyShareLink, importProject, redo, undo, updateProject } = studio;
  let importInput: HTMLInputElement;
</script>

<div class="project-identity">
  <label class="project-name"><span>Project name</span><Input aria-label="Project name" maxlength={MAX_PROJECT_NAME_LENGTH} value={studio.project.name} oninput={(event) => updateProject({ name: event.currentTarget.value })} /></label>
  <!-- The platform embed has room for its two project actions in its own rail, so they stay flat there. -->
  {#if !studio.embeddedInPlatform}
    <HeaderMenu label="Project actions" title="Project actions" triggerClass="ldt-button ldt-icon-button ldt-button--ghost ldt-button--sm project-menu-trigger" align="start">
      {#snippet trigger()}<ChevronDown size={16} aria-hidden="true" />{/snippet}
      <button type="button" class="ldt-menu__item" role="menuitem" onclick={() => importInput.click()}><span>Import project JSON</span><Upload size={16} aria-hidden="true" /></button>
      <button type="button" class="ldt-menu__item" role="menuitem" title="Copy a link that opens this design" onclick={() => void copyShareLink()}><span>Copy share link</span><Link size={16} aria-hidden="true" /></button>
      <hr class="ldt-menu__separator" />
      <button type="button" class="ldt-menu__item" role="menuitem" aria-haspopup="dialog" disabled={!studio.booted} onclick={() => { studio.resetOpen = true; }}><span>Reset project…</span><RotateCcw size={16} aria-hidden="true" /></button>
    </HeaderMenu>
  {/if}
</div>
<div class="history-actions">
  <IconButton label="Undo" title="Undo (Ctrl+Z / ⌘Z)" aria-keyshortcuts="Control+Z Meta+Z" onclick={undo} disabled={!!studio.placement || !studio.historyAvailability.canUndo}><Undo2 size={17} /></IconButton>
  <IconButton label="Redo" title="Redo (Ctrl+Shift+Z / ⇧⌘Z)" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" onclick={redo} disabled={!!studio.placement || !studio.historyAvailability.canRedo}><Redo2 size={17} /></IconButton>
  {#if studio.embeddedInPlatform}
    <IconButton label="Reset project" aria-haspopup="dialog" onclick={(event: MouseEvent) => { if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus(); studio.resetOpen = true; }} disabled={!studio.booted}><RotateCcw size={17} /></IconButton>
    <IconButton label="Import project JSON" onclick={() => importInput.click()}><Upload size={17} /></IconButton>
  {/if}
</div>
<input bind:this={importInput} class="ldt-visually-hidden" type="file" accept="application/json,.json" onchange={(event) => { const input = event.currentTarget; void importProject(input.files?.[0]).finally(() => { input.value = ""; }); }} />
