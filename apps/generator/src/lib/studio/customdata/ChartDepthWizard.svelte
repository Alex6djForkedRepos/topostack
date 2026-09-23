<script lang="ts">
  import { draft } from "$lib/studio/customdata/chart-draft.svelte";
  import { cancelDepthPoint, canTrace, confirmDepthPoint, editDepthPoint, MIN_CHART_DEPTH_POINTS, removeDepth, session, traceChart, traceHint, unitLabel } from "$lib/studio/customdata/chart-tracing.svelte";

  let { canvas }: { canvas: HTMLCanvasElement | undefined } = $props();
  let input = $state<HTMLInputElement>();
  let card = $state<HTMLDivElement>();
  let left = $state(12);
  let top = $state(12);
  const count = $derived(draft.depths.length);
  const number = $derived(session.point?.index === undefined ? count + 1 : session.point.index + 1);
  const ready = $derived(count >= MIN_CHART_DEPTH_POINTS);

  // Keep the floating card beside the selected point and inside the viewport,
  // including when the chart is scrolled or the mobile keyboard changes its size.
  function positionCard(): void {
    const point = session.point;
    if (!point || !canvas || !draft.image || !card) return;
    const bounds = canvas.getBoundingClientRect();
    const x = bounds.left + point.x / draft.image.width * bounds.width;
    const y = bounds.top + point.y / draft.image.height * bounds.height;
    const viewport = window.visualViewport;
    const width = viewport?.width ?? window.innerWidth;
    const height = viewport?.height ?? window.innerHeight;
    const originX = viewport?.offsetLeft ?? 0;
    const originY = viewport?.offsetTop ?? 0;
    const size = card.getBoundingClientRect();
    left = Math.max(originX + 12, Math.min(x + 18, originX + width - size.width - 12));
    const below = y + 18;
    top = Math.max(originY + 12, Math.min(below + size.height <= originY + height - 12 ? below : y - size.height - 18, originY + height - size.height - 12));
  }

  $effect(() => {
    if (!session.point || !input) return;
    positionCard();
    input.focus({ preventScroll: true });
    input.select();
  });
  $effect(() => {
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", positionCard);
    viewport?.addEventListener("scroll", positionCard);
    return () => { viewport?.removeEventListener("resize", positionCard); viewport?.removeEventListener("scroll", positionCard); };
  });

  $effect(() => {
    if (!card || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(positionCard);
    observer.observe(card);
    return () => observer.disconnect();
  });

  function returnToChart(): void { canvas?.focus({ preventScroll: true }); }
  function cancel(): void { cancelDepthPoint(); returnToChart(); }
  function confirm(event: SubmitEvent): void {
    event.preventDefault();
    if (confirmDepthPoint()) returnToChart();
    else input?.focus({ preventScroll: true });
  }
</script>

<svelte:window onresize={positionCard} />
<svelte:document onscrollcapture={positionCard} />

<aside class="chart-depth-guide" aria-label="Contour depth guide">
  <div class="chart-depth-guide__heading" role="status">
    <strong>{session.busy ? "Tracing your chart…" : session.point ? `Point ${number}${number <= MIN_CHART_DEPTH_POINTS ? ` of ${MIN_CHART_DEPTH_POINTS}` : ""} · enter its value` : ready ? `${count} points confirmed` : `Point ${count + 1} of ${MIN_CHART_DEPTH_POINTS} · select a contour`}</strong>
    <span>{session.point ? "Confirm the value in the floating card, or cancel to choose another point." : ready ? "Review your points, add more, or trace the lake bed." : count === 0 ? "Click a labelled contour line to get started." : "Choose a different contour line, then enter the value printed on it."}</span>
  </div>
  <ol class="chart-wizard-progress" aria-label="Minimum three points">
    {#each [1, 2, 3] as step}
      <li class:complete={count >= step} aria-current={count + 1 === step ? "step" : undefined}><span>{count >= step ? "✓" : step}</span><span class="ldt-visually-hidden">Point {step}{count >= step ? " confirmed" : ""}</span></li>
    {/each}
  </ol>
  {#if count}
    <div class="chart-wizard-points" aria-label="Confirmed points">
      {#each draft.depths as depth, index}
        <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" aria-label={`Edit confirmed point ${index + 1}: ${depth.value} ${unitLabel(draft.units)}`} disabled={session.busy || session.keeping} onclick={() => editDepthPoint(index)}>{index + 1} · {depth.value} {unitLabel(draft.units)}</button>
      {/each}
    </div>
  {/if}
  <div class="chart-depth-guide__actions">
    <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" disabled={!count || session.busy || session.keeping} onclick={() => { removeDepth(count - 1); returnToChart(); }}>Undo last point</button>
    <button class="ldt-button ldt-button--primary ldt-button--sm" type="button" disabled={!canTrace() || session.busy || session.keeping} title={traceHint() || "Trace the lake bed"} onclick={() => void traceChart()}>Trace chart</button>
  </div>
</aside>

{#if session.point}
  <div tabindex="-1" bind:this={card} class="ldt-dialog chart-point-card" style:left={`${left}px`} style:top={`${top}px`} role="dialog" aria-modal="false" aria-labelledby="chart-point-title" aria-describedby="chart-point-help" onkeydown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } }}>
    <form novalidate onsubmit={confirm}>
      <header class="ldt-dialog__header">
        <h2 id="chart-point-title" class="ldt-dialog__title">{session.point.index === undefined ? "Assign" : "Edit"} point {number}</h2>
      </header>
      <div class="ldt-dialog__body chart-point-card__body">
        <p id="chart-point-help" class="ldt-dialog__description">Enter the {draft.reads === "elevation" ? "elevation" : "depth"} printed on this contour.</p>
        <div class="ldt-field">
          <label class="ldt-field__label" for="chart-point-value">{draft.reads === "elevation" ? "Elevation" : "Depth"} ({unitLabel(draft.units)})</label>
          <input class="ldt-input ldt-input--boxed" bind:this={input} id="chart-point-value" type="number" step="any" min={draft.reads === "depth" ? 0 : undefined} value={session.pendingDepth} oninput={(event) => { session.pendingDepth = event.currentTarget.value; session.error = ""; }} aria-invalid={!!session.error} aria-describedby={session.error ? "chart-point-error" : undefined} placeholder="e.g. 10" />
          {#if session.error}<p id="chart-point-error" class="ldt-field__error" role="alert">{session.error}</p>{/if}
        </div>
      </div>
      <footer class="ldt-dialog__footer">
        <button class="ldt-button" type="button" onclick={cancel}>Cancel</button>
        <button class="ldt-button ldt-button--primary" type="submit">{session.point.index !== undefined ? "Save change" : count + 1 < MIN_CHART_DEPTH_POINTS ? "Confirm & next" : "Confirm point"}</button>
      </footer>
    </form>
  </div>
{/if}
