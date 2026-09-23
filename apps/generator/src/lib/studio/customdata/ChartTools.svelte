<script lang="ts">
  import { Button, Field, Input, Select } from "@loidolt/theme-svelte";
  import { Upload } from "@lucide/svelte";
  import type { ChartableLake } from "$lib/domain/lake-lookup";
  import { getStudio } from "$lib/studio/studio-context";
  import ChartLibrary from "$lib/studio/customdata/ChartLibrary.svelte";
  import LakePicker from "$lib/studio/customdata/LakePicker.svelte";
  import { draft, resetChartImage, resetDraft } from "$lib/studio/customdata/chart-draft.svelte";
  import { library, refreshLibrary } from "$lib/studio/customdata/chart-library.svelte";
  import { canTrace, CHART_ATTESTATIONS, CHART_READS, CHART_UNITS, chooseChartFile, keepChart, removeDepth, resetSession, resultIsCurrent, session, traceChart, tryNextPlacement, unitLabel } from "$lib/studio/customdata/chart-tracing.svelte";

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

  function chooseLake(lake: ChartableLake): void {
    resetDraft();
    resetSession();
    draft.lake = lake;
    draft.title = `${lake.name} depth chart`;
  }

  function startOver(): void {
    resetDraft();
    resetSession();
  }

  async function keep(): Promise<void> {
    const record = draft.result?.record;
    if (!record) return;
    if (!await keepChart((chart) => studio.saveChartToLibrary(chart))) return;
    await refreshLibrary();
    library.note = `${draft.title.trim() || "Chart"} kept. Use it for its lake to carve it.`;
    startOver();
  }

  function choosePage(value: string): void {
    const pdf = draft.pdf;
    const page = Number(value);
    if (!pdf || !Number.isInteger(page) || page < 1 || page > pdf.pages || page === pdf.page) return;
    void chooseChartFile(pdf.file, page);
  }
</script>

<p class="custom-data-intro">Trace a printed depth chart into the lake bed it shows. Keep as many as you like: a chart carves a lake only once you use it for that lake and regenerate. You can do this before you frame a map.</p>

<!-- With a chart open, the canvas shows the error beside the work; say it once. -->
{#if session.error && !draft.image}<p class="chart-error" role="alert">{session.error}</p>{/if}

<div class="chart-tools">
  <div class="subgroup-heading"><p>The lake</p></div>
  {#if draft.lake}
    <p class="chart-chosen"><strong>{draft.lake.name}</strong><button type="button" onclick={startOver}>Choose another</button></p>
  {:else}
    <LakePicker onChoose={chooseLake} />
  {/if}
</div>

{#if draft.lake}
  <div class="chart-tools">
    <div class="subgroup-heading"><p>The picture</p></div>
    <label class="chart-upload">
      <Upload size={16} />
      <span>{session.busy && !draft.image ? "Reading the file…" : draft.image ? draft.imageName || "Choose another file" : "Choose a chart picture or PDF"}</span>
      <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" onchange={(event) => { const input = event.currentTarget; void chooseChartFile(input.files?.[0]).finally(() => { input.value = ""; }); }} />
    </label>
    {#if draft.pdf && draft.pdf.pages > 1}
      <Field label={`Page, of ${draft.pdf.pages}`} class="field-row">{#snippet children({ id })}<Input {id} type="number" min="1" max={String(draft.pdf!.pages)} step="1" value={String(draft.pdf!.page)} disabled={session.busy} boxed onchange={(event) => choosePage(event.currentTarget.value)} />{/snippet}</Field>
    {/if}
    {#if draft.image}<button type="button" class="chart-plain-action" onclick={resetChartImage}>Start this chart again</button>{/if}
  </div>

  {#if draft.image}
    <div class="chart-tools">
      <div class="subgroup-heading"><p>What it prints</p></div>
      <div class="field-stack">
        <Field label="Depths are in" class="field-row">{#snippet children({ id })}<Select {id} bind:value={draft.units} options={CHART_UNITS} />{/snippet}</Field>
        <Field label="The chart prints" class="field-row">{#snippet children({ id })}<Select {id} bind:value={draft.reads} options={CHART_READS} />{/snippet}</Field>
        {#if draft.reads === "elevation"}
          <Field label="Surface level" class="field-row">{#snippet children({ id })}<Input {id} type="number" bind:value={draft.surface} placeholder={`Water level, in ${unitLabel(draft.units)}`} boxed />{/snippet}</Field>
        {/if}
        <Field label="Contour interval" class="field-row">{#snippet children({ id })}<Input {id} type="number" min="0" step="0.5" bind:value={draft.interval} boxed />{/snippet}</Field>
      </div>
    </div>

    <div class="chart-tools">
      <div class="subgroup-heading"><p>Depths <span>{draft.depths.length}</span></p></div>
      <Field label="Depth to place" class="field-row">{#snippet children({ id })}<Input {id} type="number" value={String(session.pendingDepth)} placeholder="e.g. 10" boxed oninput={(event) => { session.pendingDepth = event.currentTarget.value; }} />{/snippet}</Field>
      <p class="chart-hint">Click the contour it is printed on, or focus the chart and use the arrow keys, then press Enter.</p>
      {#if draft.depths.length}
        <ul class="chart-depths">
          {#each draft.depths as depth, index (index)}
            <li><span>{depth.value} {unitLabel(draft.units)}</span><button type="button" aria-label={`Remove the ${depth.value} ${unitLabel(draft.units)} depth`} onclick={() => removeDepth(index)}>Remove</button></li>
          {/each}
        </ul>
      {/if}
      <Button variant="primary" disabled={!canTrace() || session.busy} onclick={() => void traceChart()}>{session.busy ? "Tracing…" : current ? "Trace again" : "Trace this chart"}</Button>
      {#if current && current.report.placements > 1}
        <!-- The outline alone cannot always say which way round the chart goes. -->
        <Button disabled={session.busy} onclick={() => void tryNextPlacement()}>Try another placement ({current.report.placement + 1} of {current.report.placements})</Button>
      {/if}
    </div>

    {#if current}
      <div class="chart-tools">
        <div class="subgroup-heading"><p>Keep it</p></div>
        <div class="field-stack">
          <Field label="Chart name" class="field-row">{#snippet children({ id })}<Input {id} bind:value={draft.title} boxed />{/snippet}</Field>
          <Field label="Where this chart came from" class="field-row">{#snippet children({ id })}<Select {id} bind:value={draft.attestation} options={CHART_ATTESTATIONS} />{/snippet}</Field>
        </div>
        <Button variant="primary" disabled={session.keeping} onclick={() => void keep()}>{session.keeping ? "Keeping…" : "Keep this chart"}</Button>
        <p class="chart-hint">Kept in this browser. Nothing is carved until you use it for a lake.</p>
      </div>
    {/if}
  {/if}
{/if}

<ChartLibrary />
