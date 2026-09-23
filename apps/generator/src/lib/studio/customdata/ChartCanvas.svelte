<script lang="ts">
  import { nearestChartContour, type ChartContour } from "$lib/domain/chart-contours";
  import { ChartTraceClient } from "$lib/workers/chart-trace-client";
  import { tick } from "svelte";
  import { openCustomDataSection } from "$lib/studio/customdata/custom-data-nav.svelte";
  import { ImageUp, MapPin } from "@lucide/svelte";
  import { CHART_UNIT_METRES } from "@topostack/data-contracts/chart-bathymetry";
  import ChartDepthWizard from "$lib/studio/customdata/ChartDepthWizard.svelte";
  import { draft } from "$lib/studio/customdata/chart-draft.svelte";
  import { paintChart, paintDepthPreview, selectDepthPoint, resultIsCurrent, session, unitLabel } from "$lib/studio/customdata/chart-tracing.svelte";

  /**
   * The chart itself: the picture a maker clicks to place depths on, and the
   * lake bed those depths gave. Its controls are in the sidebar, so this holds
   * only what wants the room.
   */

  /** How far off a line a click may land and still count, in screen pixels. */
  const CLICK_REACH_PX = 12;

  /** How far one arrow key moves the crosshair, in screen pixels; Shift moves ten times as far. */
  const KEY_STEP_PX = 2;

  let canvas = $state<HTMLCanvasElement | undefined>();
  let previewCanvas = $state<HTMLCanvasElement | undefined>();

  async function reviewAndSave(): Promise<void> {
    openCustomDataSection("charts");
    await tick();
    const heading = document.getElementById("chart-save-heading");
    heading?.focus();
    heading?.scrollIntoView({ block: "nearest" });
  }

  let threeUnavailable = $state(false);
  /**
   * The keyboard's pointer on the chart, in image pixels. Depths can be placed
   * without a mouse: focus the chart, steer the crosshair onto a contour with
   * the arrow keys, and press Enter. It is drawn only while the chart has focus.
   */
  let crosshair = $state<{ x: number; y: number } | undefined>();
  let focused = $state(false);

  let contours = $state.raw<ChartContour[]>([]);
  let detecting = $state(false);
  let detectionError = $state(false);
  let pointer = $state<{ x: number; y: number }>();
  const activeContour = $derived.by(() => {
    const point = session.point ?? pointer ?? (focused ? crosshair : undefined);
    return point ? nearestChartContour(contours, point.x, point.y, CLICK_REACH_PX * imagePerScreen()) : undefined;
  });

  const highlightedIndex = $derived(activeContour?.index);

  $effect(() => {
    const image = draft.image;
    contours = []; pointer = undefined; detectionError = false;
    if (!image) { detecting = false; return; }
    const client = new ChartTraceClient();
    let current = true;
    detecting = true;
    void client.contours({ width: image.width, height: image.height, data: image.data }).then((lines) => {
      if (current) contours = lines;
    }).catch(() => { if (current) detectionError = true; }).finally(() => { if (current) detecting = false; });
    return () => { current = false; client.dispose(); };
  });

  $effect(() => {
    if (draft.image && canvas) {
      void draft.depths;
      paintChart(canvas, session.point ?? (focused ? crosshair : undefined), highlightedIndex === undefined ? undefined : contours[highlightedIndex]);
    }
  });

  function selectPoint(x: number, y: number): void {
    if (detecting) return;
    const reach = CLICK_REACH_PX * imagePerScreen();
    const existing = draft.depths.some(point => Math.hypot(point.x - x, point.y - y) <= reach);
    const hit = nearestChartContour(contours, x, y, reach);
    if (contours.length && !hit && !existing) return;
    selectDepthPoint(existing ? x : hit?.x ?? x, existing ? y : hit?.y ?? y, reach);
  }

  function hover(event: PointerEvent): void {
    if (!canvas || !draft.image || session.busy || session.point) return;
    const bounds = canvas.getBoundingClientRect();
    pointer = { x: (event.clientX - bounds.left) * draft.image.width / bounds.width, y: (event.clientY - bounds.top) * draft.image.height / bounds.height };
  }

  // A new picture starts the crosshair again from its middle.
  $effect(() => { void draft.image; crosshair = undefined; });

  /** Image pixels per screen pixel, as the chart is drawn right now. */
  function imagePerScreen(): number {
    const image = draft.image;
    const width = canvas?.getBoundingClientRect().width ?? 0;
    return image && width > 0 ? image.width / width : 1;
  }

  function onFocus(): void {
    focused = true;
    if (!crosshair && draft.image) crosshair = { x: draft.image.width / 2, y: draft.image.height / 2 };
  }

  function onKey(event: KeyboardEvent): void {
    const image = draft.image;
    if (!image || !crosshair) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectPoint(crosshair.x, crosshair.y);
      return;
    }
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    pointer = undefined;
    const step = KEY_STEP_PX * (event.shiftKey ? 10 : 1) * imagePerScreen();
    crosshair = {
      x: Math.max(0, Math.min(image.width - 1, crosshair.x + move[0] * step)),
      y: Math.max(0, Math.min(image.height - 1, crosshair.y + move[1] * step)),
    };
  }

  $effect(() => {
    if (draft.result && previewCanvas) paintDepthPreview(previewCanvas);
  });

  /** Select the highlighted contour before asking for its depth. */
  function place(event: MouseEvent): void {
    const image = draft.image;
    if (!canvas || !image) return;
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * (image.width / bounds.width);
    const y = (event.clientY - bounds.top) * (image.height / bounds.height);
    // The crosshair follows the mouse, so a keyboard nudge starts from the last click.
    crosshair = { x, y };
    selectPoint(x, y);
  }
</script>

<div class="chart-stage">
  {#if !draft.lake}
    <div class="chart-stage__empty">
      <MapPin size={28} aria-hidden="true" />
      <h2>Turn a depth chart into a lake bed</h2>
      <p>Start in the sidebar: search for the lake this chart shows.</p>
      <ol><li>Choose a lake and upload its chart.</li><li>Place depths on the printed contours.</li><li>Trace, review, and save it to your library.</li></ol>
      <small>Use a saved chart for its lake, then regenerate terrain to apply it.</small>
    </div>
  {:else if !draft.image}
    <p class="chart-stage__empty"><ImageUp size={20} />Choose a picture of {draft.lake.name}'s chart in the sidebar: a scan, a photo or a screenshot. Straight-on works best.</p>
  {:else}
    <div class="chart-workspace">
    <section class="chart-editor" aria-label="Chart editor">
    <h3 class="chart-result__title">Chart editor</h3>
    <ChartDepthWizard {canvas} />
    <figure class="chart-figure">
      <div class="chart-image-area" style:--chart-aspect={draft.image.width / draft.image.height}>
      <!-- A canvas may not take the application role, so the arrow keys are
           described instead; the picture itself is the thing to steer on. -->
      <canvas bind:this={canvas} width={draft.image.width} height={draft.image.height} class="chart-canvas" data-contour={activeContour?.index} aria-busy={detecting} onpointermove={hover} onpointerleave={() => { pointer = undefined; }} tabindex="0" aria-describedby="chart-keys" onclick={place} onfocus={onFocus} onblur={() => { focused = false; }} onkeydown={onKey} aria-label={`${draft.lake.name}, ${draft.depths.length} depths placed`}></canvas>
      <span id="chart-keys" class="ldt-visually-hidden">Arrow keys move the crosshair, Shift with an arrow moves it further, and Enter selects a point and opens its depth entry card. Confirm the value to continue to the next point.</span>
      <span class="ldt-visually-hidden" aria-live="polite">{focused && crosshair ? `Crosshair ${Math.round((crosshair.x / draft.image.width) * 100)}% across, ${Math.round((crosshair.y / draft.image.height) * 100)}% down.` : ""}</span>
      </div>
      <figcaption class="chart-hint" role="status">
        {#if detecting}Finding contour lines…
        {:else if detectionError || !contours.length}No contour preview is available. You can still select points on the printed lines manually.
        {:else if activeContour}Contour highlighted · {session.point ? "check the line, then confirm its value." : "click to assign its value."}
        {:else}Hover over a contour to check its traced path, then click to assign its {draft.reads === "elevation" ? "elevation" : "depth"}. On touch screens, tap a line to preview it.{/if}
      </figcaption>
    </figure>

    {#if session.error && !session.point}<p class="chart-error" role="alert">{session.error}</p>{/if}

    </section>
    <div class="chart-result">
      <section class="chart-result__visual chart-result__3d" aria-label="3D lake bed">
        <h3 class="chart-result__title">3D lake bed</h3>
        {#if draft.result && !resultIsCurrent()}
          <p class="chart-warning" role="status">Preview out of date. Trace again to update it.</p>
        {/if}
        <div class="chart-3d-slot">
        {#if draft.result}
          {#if !threeUnavailable}
            {#await import("./ChartDepth3D.svelte")}
              <p class="chart-preview-placeholder" role="status">Loading 3D lake bed…</p>
            {:then module}
              {#key draft.result}
                <module.default grid={draft.result.record.grid} onUnavailable={() => { threeUnavailable = true; }} />
              {/key}
            {:catch}
              <p class="chart-preview-placeholder" role="status">3D preview could not load. Inspect the flat DEM below.</p>
            {/await}
          {:else}
            <p class="chart-preview-placeholder" role="status">3D preview is unavailable. Inspect the flat DEM below.</p>
          {/if}
        {:else}
          <p class="chart-preview-placeholder">Trace your chart to inspect the lake bed in 3D.</p>
        {/if}
        </div>
      </section>
      <section class="chart-result__visual chart-result__dem" aria-label="Flat DEM">
        <h3 class="chart-result__title">Flat DEM <small>North up</small></h3>
        <figure class="chart-preview-figure" aria-label="Traced lake bed, shaded from shallow to deep">
          <div class="chart-dem-slot">
          {#if draft.result}
            <canvas bind:this={previewCanvas} class="chart-preview" aria-hidden="true"></canvas>
          {:else}
            <p class="chart-preview-placeholder">The generated depth map will appear here.</p>
          {/if}
          </div>
          <figcaption class="chart-preview-legend"><span>Shallow</span><span>Deep</span></figcaption>
        </figure>
        {#if draft.result}
        <div class="chart-result__read">
          <h3 class="ldt-visually-hidden">{resultIsCurrent() ? "Your traced lake bed" : "Previous trace"}</h3>
          <dl class="chart-report">
            <div><dt>Deepest</dt><dd>{(draft.result.report.deepestM / CHART_UNIT_METRES[draft.units]).toFixed(1)} {unitLabel(draft.units)}</dd></div>
            <div><dt>Contours levelled</dt><dd>{Math.round(draft.result.report.coverage * 100)}%</dd></div>
            <div><dt>Fit to the lake's shape</dt><dd>{Math.round(draft.result.report.iou * 100)}%</dd></div>
          </dl>
          {#if !resultIsCurrent()}
            <p class="chart-warning" role="status">Changed since this trace. Trace again to see the lake bed these depths give.</p>
          {/if}
          {#if resultIsCurrent() && draft.result.report.ambiguous}
            <p class="chart-warning" role="status">This lake fits the chart more than one way. Compare the lake bed with the chart; if it is turned, choose Try another placement.</p>
          {/if}
          {#if draft.result.report.snapUncertain}
            <p class="chart-warning" role="alert">The chart's shape does not match this lake closely. Check the preview against the lake, or try a straighter picture.</p>
          {/if}
          {#if resultIsCurrent()}<button type="button" class="chart-review-save" onclick={() => void reviewAndSave()}>Review and save chart</button>{/if}
          {#if draft.result.report.coverage < 1}
            <p class="chart-warning" role="status">Some contours carry no depth. Placing another depth usually fixes the rest.</p>
          {/if}
        </div>
        {/if}
      </section>
    </div>
    </div>
  {/if}
</div>
