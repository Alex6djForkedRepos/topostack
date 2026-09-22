<script lang="ts">
  import { ImageUp, MapPin } from "@lucide/svelte";
  import { CHART_UNIT_METRES } from "@topostack/data-contracts/chart-bathymetry";
  import { draft } from "$lib/studio/customdata/chart-draft.svelte";
  import { paintChart, paintDepthPreview, placeDepth, resultIsCurrent, session, unitLabel } from "$lib/studio/customdata/chart-tracing.svelte";

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
  /**
   * The keyboard's pointer on the chart, in image pixels. Depths can be placed
   * without a mouse: focus the chart, steer the crosshair onto a contour with
   * the arrow keys, and press Enter. It is drawn only while the chart has focus.
   */
  let crosshair = $state<{ x: number; y: number } | undefined>();
  let focused = $state(false);

  $effect(() => {
    if (draft.image && canvas) { void draft.depths; paintChart(canvas, focused ? crosshair : undefined); }
  });

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
      placeDepth(crosshair.x, crosshair.y, CLICK_REACH_PX * imagePerScreen());
      return;
    }
    const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const step = KEY_STEP_PX * (event.shiftKey ? 10 : 1) * imagePerScreen();
    crosshair = {
      x: Math.max(0, Math.min(image.width - 1, crosshair.x + move[0] * step)),
      y: Math.max(0, Math.min(image.height - 1, crosshair.y + move[1] * step)),
    };
  }

  $effect(() => {
    if (draft.result && previewCanvas) paintDepthPreview(previewCanvas);
  });

  /** A click on the picture places the typed depth where the maker clicked. */
  function place(event: MouseEvent): void {
    const image = draft.image;
    if (!canvas || !image) return;
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * (image.width / bounds.width);
    const y = (event.clientY - bounds.top) * (image.height / bounds.height);
    // The crosshair follows the mouse, so a keyboard nudge starts from the last click.
    crosshair = { x, y };
    placeDepth(x, y, CLICK_REACH_PX * (image.width / bounds.width));
  }
</script>

<div class="chart-stage">
  {#if !draft.lake}
    <p class="chart-stage__empty"><MapPin size={20} />Start in the sidebar: search for the lake this chart shows.</p>
  {:else if !draft.image}
    <p class="chart-stage__empty"><ImageUp size={20} />Choose a picture of {draft.lake.name}'s chart in the sidebar: a scan, a photo or a screenshot. Straight-on works best.</p>
  {:else}
    <figure class="chart-figure">
      <!-- A canvas may not take the application role, so the arrow keys are
           described instead; the picture itself is the thing to steer on. -->
      <canvas bind:this={canvas} width={draft.image.width} height={draft.image.height} class="chart-canvas" tabindex="0" aria-describedby="chart-keys" onclick={place} onfocus={onFocus} onblur={() => { focused = false; }} onkeydown={onKey} aria-label={`${draft.lake.name}, ${draft.depths.length} depths placed`}></canvas>
      <span id="chart-keys" class="ldt-visually-hidden">Arrow keys move the crosshair, Shift with an arrow moves it further, and Enter places the depth typed in the sidebar where it points.</span>
      <span class="ldt-visually-hidden" aria-live="polite">{focused && crosshair ? `Crosshair ${Math.round((crosshair.x / draft.image.width) * 100)}% across, ${Math.round((crosshair.y / draft.image.height) * 100)}% down.` : ""}</span>
      <figcaption class="chart-hint" role="status">
        {#if draft.depths.length === 0}Type a depth in the sidebar, then click the contour it is printed on.
        {:else if draft.depths.length < 2}1 depth placed · one more needed, because a single depth cannot say which way the lake deepens.
        {:else}{draft.depths.map((depth) => `${depth.value} ${unitLabel(draft.units)}`).join(" · ")}
        {/if}
      </figcaption>
    </figure>

    {#if session.error}<p class="chart-error" role="alert">{session.error}</p>{/if}

    {#if draft.result}
      <div class="chart-result">
        <canvas bind:this={previewCanvas} class="chart-preview"></canvas>
        <div class="chart-result__read">
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
          {#if draft.result.report.coverage < 1}
            <p class="chart-warning" role="status">Some contours carry no depth. Placing another depth usually fixes the rest.</p>
          {/if}
        </div>
      </div>
    {/if}
  {/if}
</div>
