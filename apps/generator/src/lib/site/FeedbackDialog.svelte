<script lang="ts">
  import { untrack } from 'svelte';
  import { FEEDBACK_TYPES, ISSUE_TRACKER, feedbackLink, feedbackReport, type FeedbackContext, type FeedbackType } from '$lib/site/feedback';
  let { open, initialType = 'bug', context, onClose }: { open: boolean; initialType?: FeedbackType; context?: FeedbackContext; onClose: () => void } = $props();
  let dialog: HTMLDialogElement;
  let type = $state<FeedbackType>(untrack(() => initialType));
  let summary = $state('');
  let details = $state('');
  let includeContext = $state(false);
  let copyStatus = $state('');
  const body = $derived(feedbackReport(type, details, includeContext ? context : undefined));
  const link = $derived(feedbackLink(type, summary, body));
  const valid = $derived(Boolean(summary.trim() && details.trim()));
  $effect(() => {
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
  $effect(() => { void body; void summary; copyStatus = ''; });
  async function copyReport() {
    try { await navigator.clipboard.writeText(`# [${FEEDBACK_TYPES[type].prefix}] ${summary.trim()}\n\n${body}`); copyStatus = 'Report copied. Paste it into the GitHub issue if needed.'; }
    catch { copyStatus = 'Copy is unavailable. Select and copy the report in the preview below.'; }
  }
</script>

<dialog bind:this={dialog} class="feedback-dialog" aria-labelledby="feedback-title" aria-describedby="feedback-description" onclose={onClose}>
  <header><h2 id="feedback-title">Help improve TopoStack</h2><button class="close" type="button" aria-label="Close feedback" onclick={() => dialog.close()}>×</button></header>
  <p id="feedback-description">Report a problem, suggest a feature, or flag terrain and lake data for investigation.</p>
  <div class="fields">
    <label>Feedback type<select bind:value={type}>{#each Object.entries(FEEDBACK_TYPES) as [value, option]}<option {value}>{option.label}</option>{/each}</select></label>
    <label>Summary<input bind:value={summary} maxlength="120" required placeholder="A short description" /></label>
    <label>Details<textarea bind:value={details} maxlength="4000" required rows="5" aria-describedby="feedback-hint"></textarea></label>
    <p class="hint" id="feedback-hint">{FEEDBACK_TYPES[type].hint}</p>
    {#if context}
      <label class="context-option"><input type="checkbox" bind:checked={includeContext} />Include location, settings, and data sources</label>
      <p class="hint">Optional. Includes coordinates and source diagnostics, but no project name or custom markers. Review the exact details below.</p>
    {/if}
  </div>
  <p class="privacy">Feedback is public on GitHub. A GitHub account is required. You’ll review and submit your issue there; opening GitHub does not submit it.</p>
  {#if link.needsPaste}<p class="paste-note" role="status">This report is too long for a prefilled link. Copy the report first, then paste it into the issue body on GitHub.</p>{/if}
  <div class="actions">
    {#if valid}<a class="primary" href={link.url} target="_blank" rel="noopener noreferrer">{link.needsPaste ? 'Open GitHub to paste report' : 'Continue on GitHub'} ↗<span class="sr-only"> (opens in a new tab)</span></a>{:else}<button class="primary" disabled>Continue on GitHub ↗</button>{/if}
    <button type="button" disabled={!valid} onclick={copyReport}>Copy report</button>
  </div>
  {#if copyStatus}<p role="status">{copyStatus}</p>{/if}
  <details open={link.needsPaste || copyStatus.startsWith('Copy is unavailable')}><summary>Review report{includeContext ? ' and shared context' : ''}</summary><textarea class="report-preview" aria-label="Report preview" readonly rows="9" value={body}></textarea></details>
  <p class="existing"><a href={ISSUE_TRACKER} target="_blank" rel="noopener noreferrer">Browse existing feedback ↗<span class="sr-only"> (opens in a new tab)</span></a> · Add screenshots on GitHub.</p>
</dialog>

<style>
  .feedback-dialog { box-sizing: border-box; width: min(560px, calc(100vw - 24px)); max-height: calc(100dvh - 32px); margin: auto; padding: 24px; overflow: auto; border: 1px solid var(--loidolt-border); border-radius: 12px; background: var(--loidolt-background); color: var(--loidolt-text); font: 14px/1.5 var(--loidolt-font-body, sans-serif); box-shadow: 0 20px 80px #0005; }
  .feedback-dialog::backdrop { background: #0008; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h2 { font-size: 21px; line-height: 1.3; margin: 0; }
  p { margin: 12px 0; }
  .fields { display: grid; gap: 12px; }
  label { display: grid; gap: 6px; font-weight: 500; }
  input:not([type=checkbox]), select, textarea { box-sizing: border-box; width: 100%; min-width: 0; border: 1px solid var(--loidolt-border); border-radius: 5px; background: var(--loidolt-surface); color: var(--loidolt-text); padding: 10px; font: inherit; }
  textarea { resize: vertical; }
  .context-option { display: flex; align-items: center; gap: 8px; }
  input[type=checkbox] { flex-shrink: 0; width: 18px; height: 18px; }
  .hint { margin: -6px 0 0; font-size: 12px; color: var(--loidolt-text-muted); }
  .privacy, .paste-note { padding: 12px; background: var(--loidolt-surface); border-radius: 5px; font-size: 12px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
  button, .primary { display: inline-flex; justify-content: center; align-items: center; min-height: 40px; padding: 8px 12px; border: 1px solid var(--loidolt-border); border-radius: 5px; font: inherit; cursor: pointer; background: var(--loidolt-surface); color: var(--loidolt-text); text-decoration: none; }
  .primary { background: var(--loidolt-accent); color: var(--loidolt-on-accent); }
  button:disabled { opacity: .5; cursor: default; }
  .close { padding: 0; min-width: 40px; font-size: 24px; background: transparent; border: 0; }
  a { color: var(--loidolt-text-accent); }
  :is(button, a, input, textarea, select, summary):focus-visible { outline: 2px solid var(--loidolt-accent); outline-offset: 3px; }
  summary { cursor: pointer; }
  .report-preview { margin-top: 12px; max-height: 230px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--loidolt-surface); padding: 12px; font-size: 11px; user-select: text; }
  .existing { font-size: 12px; color: var(--loidolt-text-muted); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  @media (max-width: 450px) { .feedback-dialog { padding: 16px; } }
</style>
