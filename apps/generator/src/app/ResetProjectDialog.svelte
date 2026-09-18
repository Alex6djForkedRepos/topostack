<script lang="ts">
  import { onMount } from "svelte";
  import { Button } from "@loidolt/theme-svelte";

  let { onConfirm, onClose }: { onConfirm: () => void; onClose: () => void } = $props();
  let dialog: HTMLDialogElement;
  let cancelButton: HTMLDivElement;

  onMount(() => {
    dialog.showModal();
    cancelButton.querySelector("button")?.focus();
  });
</script>

<dialog bind:this={dialog} class="ldt-dialog reset-dialog" aria-labelledby="reset-dialog-title" aria-describedby="reset-dialog-description" onclose={onClose}>
  <header class="ldt-dialog__header">
    <h2 id="reset-dialog-title" class="ldt-dialog__title">Reset project?</h2>
  </header>
  <div class="ldt-dialog__body">
    <p id="reset-dialog-description">This restores the Crater Lake preview and all default settings, clears your custom markers and lines, and cancels any terrain generation. The reset saves automatically. You can use Undo to recover your previous settings.</p>
  </div>
  <footer class="reset-dialog-actions">
    <div bind:this={cancelButton}><Button onclick={() => dialog.close()}>Cancel</Button></div>
    <Button variant="primary" onclick={() => { dialog.close(); onConfirm(); }}>Reset project</Button>
  </footer>
</dialog>

<style>
  .reset-dialog {
    position: fixed;
    inset: 16px;
    margin: auto;
    transform: none;
    width: min(440px, calc(100% - 32px));
    height: fit-content;
    max-width: none;
    max-height: calc(100dvh - 32px);
    padding: 0;
    overflow-y: auto;
  }
  .reset-dialog p { margin: 0; }
  .reset-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; padding: 16px 24px 24px; }
</style>
