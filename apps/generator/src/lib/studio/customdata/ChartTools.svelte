<script lang="ts">
  import { cancelLakePicker } from "$lib/studio/customdata/lake-picker.svelte";
  import { Button, Field, Input, Select } from "@loidolt/theme-svelte";
  import { Upload } from "@lucide/svelte";
  import { getStudio } from "$lib/studio/studio-context";
  import ChartLibrary from "$lib/studio/customdata/ChartLibrary.svelte";
  import LakePicker from "$lib/studio/customdata/LakePicker.svelte";
  import { draft, draftRevision, resetChartImage, resetDraft } from "$lib/studio/customdata/chart-draft.svelte";
  import { library, refreshLibrary } from "$lib/studio/customdata/chart-library.svelte";
  import { canTrace, CHART_ATTESTATIONS, CHART_READS, CHART_UNITS, chooseChartFile, keepChart, editDepthPoint, removeDepth, resetSession, resultIsCurrent, session, traceChart, traceHint, traceInputsKey, tryNextPlacement, unitLabel } from "$lib/studio/customdata/chart-tracing.svelte";

  /**
   * Every control for tracing a depth chart, in the sidebar section beside the
   * chart itself: the lake it is of, the picture, what its numbers mean, the
   * depths placed on it, and the library it is kept in.
   *
   * Tracing a chart and carving a lake with it are separate jobs, so none of
   * this needs terrain or a map area: a lake is found by name, and only the
   * explicit "Use for" in the library changes the project. That way a maker
   * can build charts long before framing anything.
   */

  const studio = getStudio();
  const current = $derived(draft.result && resultIsCurrent() ? draft.result : undefined);

  function startOver(): void {
    cancelLakePicker();
    resetDraft();
    resetSession();
  }

  async function keep(): Promise<void> {
    const record = draft.result?.record;
    if (!record) return;
    const revision = draftRevision();
    const inputs = traceInputsKey();
    const title = draft.title.trim() || "Chart";
    if (!await keepChart((chart) => studio.saveChartToLibrary(chart))) return;
    await refreshLibrary();
    library.note = `${title} saved. Choose Use for its lake, then regenerate terrain to apply it.`;
    if (revision === draftRevision() && inputs === traceInputsKey()) startOver();
  }

  function choosePage(value: string): void {
    const pdf = draft.pdf;
    const page = Number(value);
    if (!pdf || !Number.isInteger(page) || page < 1 || page > pdf.pages || page === pdf.page) return;
    void chooseChartFile(pdf.file, page);
  }
</script>

<p class="custom-data-intro">Turn contour lines into a lake bed. Follow the steps below, then save the result and apply it to your project.</p>

<!-- With a chart open, the canvas shows the error beside the work; say it once. -->
{#if session.error && !draft.image}<p class="chart-error" role="alert">{session.error}</p>{/if}

<div class="chart-tools">
  <h3 class="chart-tools__heading">1 · Choose a lake</h3>
  {#if draft.lake}
    <p class="chart-chosen"><strong>{draft.lake.name}</strong><button type="button" disabled={session.busy || session.keeping} onclick={startOver}>Choose another</button></p>
  {:else}
    <LakePicker />
  {/if}
</div>

{#if draft.lake}
  <div class="chart-tools">
    <h3 class="chart-tools__heading">2 · Upload a chart</h3>
    <label class="chart-upload">
      <Upload size={16} />
      <span>{session.busy && !draft.image ? "Reading the file…" : draft.image ? draft.imageName || "Choose another file" : "Choose a chart picture or PDF"}</span>
      <input type="file" disabled={session.busy || session.keeping} accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onchange={(event) => { const input = event.currentTarget; void chooseChartFile(input.files?.[0]).finally(() => { input.value = ""; }); }} />
    </label>
    <p class="chart-hint">PNG, JPEG, WebP or PDF. Crop to the lake and its contours before uploading; avoid legends and page borders. A straight-on image works best.</p>
    {#if draft.pdf && draft.pdf.pages > 1}
      <Field label={`Page, of ${draft.pdf.pages}`} class="field-row">{#snippet children({ id })}<Input {id} type="number" min="1" max={String(draft.pdf!.pages)} step="1" value={String(draft.pdf!.page)} disabled={session.busy} boxed onchange={(event) => choosePage(event.currentTarget.value)} />{/snippet}</Field>
    {/if}
    {#if draft.image}<button type="button" class="chart-plain-action" disabled={session.busy || session.keeping} onclick={() => { resetSession(); resetChartImage(); }}>Start this chart again</button>{/if}
  </div>

  {#if draft.image}
    <div class="chart-tools">
      <h3 class="chart-tools__heading">3 · Set the chart units</h3>
      <div class="field-stack">
        <Field label="Depths are in" class="field-row">{#snippet children({ id })}<Select {id} bind:value={draft.units} options={CHART_UNITS} />{/snippet}</Field>
        <Field label="The chart prints" class="field-row">{#snippet children({ id })}<Select {id} bind:value={draft.reads} options={CHART_READS} />{/snippet}</Field>
        {#if draft.reads === "elevation"}
          <Field label="Surface level" class="field-row">{#snippet children({ id })}<Input {id} type="number" bind:value={draft.surface} placeholder={`Water level, in ${unitLabel(draft.units)}`} boxed />{/snippet}</Field>
        {/if}
        <Field label="Contour interval" class="field-row">{#snippet children({ id })}<Input {id} type="number" min="0" step="0.5" bind:value={draft.interval} boxed />{/snippet}</Field>
      </div>
      <p class="chart-hint">The interval is the difference between neighbouring contours, in {unitLabel(draft.units)}. Leave it blank to infer it from the depths you place.</p>
    </div>

    <div class="chart-tools">
      <h3 class="chart-tools__heading">4 · Place depths <span>{draft.depths.length}</span></h3>
      <p class="chart-hint">Follow the floating guide on the chart: select a contour, enter its value, and confirm. At least three points are required; use different contour lines across the lake.</p>
      {#if draft.depths.length}
        <ul class="chart-depths">
          {#each draft.depths as depth, index (index)}
            <li><button type="button" aria-label={`Edit point ${index + 1}`} disabled={session.busy || session.keeping} onclick={() => editDepthPoint(index)}>{index + 1} · {depth.value} {unitLabel(draft.units)}</button><button type="button" aria-label={`Remove the ${depth.value} ${unitLabel(draft.units)} depth`} disabled={session.busy || session.keeping} onclick={() => removeDepth(index)}>Remove</button></li>
          {/each}
        </ul>
      {/if}
      {#if traceHint()}<p class="chart-hint" role="status">{traceHint()}</p>{/if}
      <Button variant="primary" disabled={!canTrace() || session.busy || session.keeping} onclick={() => void traceChart()}>{session.busy ? "Tracing…" : current ? "Trace again" : "Trace this chart"}</Button>
      {#if current && current.report.placements > 1}
        <!-- The outline alone cannot always say which way round the chart goes. -->
        <Button disabled={session.busy} onclick={() => void tryNextPlacement()}>Try another placement ({current.report.placement + 1} of {current.report.placements})</Button>
      {/if}
    </div>

    {#if current}
      <div class="chart-tools">
        <h3 id="chart-save-heading" class="chart-tools__heading" tabindex="-1">5 · Save your chart</h3>
        <div class="field-stack">
          <Field label="Chart name" class="field-row">{#snippet children({ id })}<Input {id} bind:value={draft.title} boxed />{/snippet}</Field>
          <Field label="Where this chart came from" class="field-row">{#snippet children({ id })}<Select {id} bind:value={draft.attestation} options={CHART_ATTESTATIONS} />{/snippet}</Field>
        </div>
        <Button variant="primary" disabled={session.keeping} onclick={() => void keep()}>{session.keeping ? "Keeping…" : "Keep this chart"}</Button>
        <p class="chart-hint">Saved in this browser and included in exported project files. Next, choose Use for your lake in Your charts and regenerate terrain.</p>
      </div>
    {/if}
  {/if}
{/if}

<ChartLibrary />
