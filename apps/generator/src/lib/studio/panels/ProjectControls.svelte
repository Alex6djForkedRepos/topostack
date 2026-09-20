<script lang="ts">
  import { RotateCcw, Undo2, Redo2, Upload } from "@lucide/svelte";
  import { IconButton, Input } from "@loidolt/theme-svelte";
  import { MAX_PROJECT_NAME_LENGTH } from "@topostack/core";
  import { getStudio } from "$lib/studio/studio-context";

  const studio = getStudio();
  const { importProject, redo, undo, updateProject } = studio;
  let importInput: HTMLInputElement;
</script>

<label class="project-name"><span>Project name</span><Input aria-label="Project name" maxlength={MAX_PROJECT_NAME_LENGTH} value={studio.project.name} oninput={(event) => updateProject({ name: event.currentTarget.value })} /></label>
<div class="history-actions">
  <IconButton label="Undo" onclick={undo} disabled={!studio.historyAvailability.canUndo}><Undo2 size={17} /></IconButton>
  <IconButton label="Redo" onclick={redo} disabled={!studio.historyAvailability.canRedo}><Redo2 size={17} /></IconButton>
  <IconButton label="Reset project" aria-haspopup="dialog" onclick={(event: MouseEvent) => { if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus(); studio.resetOpen = true; }} disabled={!studio.booted}><RotateCcw size={17} /></IconButton>
  <IconButton label="Import project JSON" onclick={() => importInput.click()}><Upload size={17} /></IconButton>
  <input bind:this={importInput} class="ldt-visually-hidden" type="file" accept="application/json,.json" onchange={(event) => { const input = event.currentTarget; void importProject(input.files?.[0]).finally(() => { input.value = ""; }); }} />
</div>
