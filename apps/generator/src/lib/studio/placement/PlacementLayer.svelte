<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Button } from "@loidolt/theme-svelte";
  import { Move } from "@lucide/svelte";
  import { displayLength, lengthUnit, type Point2D, type ProjectConfigV1 } from "@topostack/core";
  import { markingColor, markingWidth } from "$lib/studio/marking-style";
  import { labelPaths, markingPath, pointsToPath } from "$lib/studio/svg-path";
  import { availablePlaceables, draftProject, movePlaceable, PLACEABLES, resizePlaceable, type PlaceableId, type PlacementContext, type PlacementSession } from "./placeables";
  import { placementViewBox } from "./viewport";

  let { project, context, session, widthMm, heightMm, marginMm, interactive = true, onChange, onDone, onCancel }: {
    project: ProjectConfigV1;
    context: PlacementContext;
    session: PlacementSession;
    /** Size of the artwork the backdrop shows, which frames this layer too. */
    widthMm: number;
    heightMm: number;
    marginMm: number;
    /** False while Done's regeneration lands or the layer fades out: drafts stay drawn, input is ignored. */
    interactive?: boolean;
    onChange: (session: PlacementSession) => void;
    onDone: () => void;
    onCancel: () => void;
  } = $props();

  const NUDGE_MM = 1;
  const NUDGE_LARGE_MM = 10;
  /** On-screen radius of the resize grip, in pixels. */
  const GRIP_PX = 7;

  let svg: SVGSVGElement;
  let drag: { id: PlaceableId; pointerId: number; x: number; y: number; unitsPerPixel: number; start: Point2D } | undefined;
  let resizing: { id: PlaceableId; pointerId: number; center: Point2D; startDistance: number; startSize: number } | undefined;
  let dragging = $state<PlaceableId | undefined>();
  // Millimeters per pixel, kept current so the grip stays the same size on screen.
  let pixel = $state(0.5);

  const draft = $derived(draftProject(project, session));
  const items = $derived(availablePlaceables(draft).map((placeable) => ({
    placeable,
    grip: placeable.resize ? gripPoint(placeable.outline(draft, context)) : undefined,
    outline: pointsToPath(placeable.outline(draft, context)),
    markings: placeable.markings(draft, context),
  })));
  const viewBox = $derived(placementViewBox(widthMm, heightMm, marginMm));
  const selected = $derived(PLACEABLES[session.selected]);
  const selectedLabel = $derived(selected.label);
  const sizeReadout = $derived(selected.resize && selected.available(draft) ? `${selected.resize.label} ${Number(displayLength(selected.resize.value(draft), draft.units).toFixed(draft.units === "imperial" ? 2 : 1))} ${lengthUnit(draft.units)}` : undefined);

  /** The outline point furthest toward the lower right: a box corner, or 45° round a circle. */
  function gripPoint(ring: Point2D[]): Point2D {
    return ring.reduce((best, point) => (point.x + point.y > best.x + best.y ? point : best), ring[0] ?? { x: 0, y: 0 });
  }

  /** Artwork millimeters per screen pixel, for a viewBox fitted with xMidYMid meet. */
  function unitsPerPixel(): number | undefined {
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return undefined;
    return Math.max(viewBox.width / rect.width, viewBox.height / rect.height);
  }

  /** A pointer position in artwork millimeters, for the meet-fitted viewBox. */
  function toArtwork(event: PointerEvent): Point2D | undefined {
    const rect = svg.getBoundingClientRect();
    const scale = unitsPerPixel();
    if (!scale) return undefined;
    const offsetX = (rect.width - viewBox.width / scale) / 2;
    const offsetY = (rect.height - viewBox.height / scale) / 2;
    return { x: viewBox.x + (event.clientX - rect.left - offsetX) * scale, y: viewBox.y + (event.clientY - rect.top - offsetY) * scale };
  }

  function resize(id: PlaceableId, sizeMm: number): void {
    if (!interactive) return;
    onChange(resizePlaceable(project, session, id, sizeMm, context));
  }

  function startResize(event: PointerEvent, id: PlaceableId): void {
    const size = PLACEABLES[id].resize;
    const point = toArtwork(event);
    if (event.button !== 0 || drag || resizing || !interactive || !size || !point) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const center = PLACEABLES[id].center(draft, context);
    resizing = { id, pointerId: event.pointerId, center, startDistance: Math.max(Math.hypot(point.x - center.x, point.y - center.y), 0.1), startSize: size.value(draft) };
    dragging = id;
    select(id);
  }

  function moveResize(event: PointerEvent): void {
    if (!resizing || resizing.pointerId !== event.pointerId) return;
    const point = toArtwork(event);
    if (!point) return;
    const distance = Math.hypot(point.x - resizing.center.x, point.y - resizing.center.y);
    resize(resizing.id, resizing.startSize * distance / resizing.startDistance);
  }

  function endResize(event: PointerEvent): void {
    if (!resizing || resizing.pointerId !== event.pointerId) return;
    resizing = undefined;
    dragging = undefined;
  }

  function move(id: PlaceableId, center: Point2D): void {
    if (!interactive) return;
    onChange(movePlaceable(project, session, id, center, context));
  }

  function select(id: PlaceableId): void {
    if (session.selected !== id) onChange({ ...session, selected: id });
  }

  function startDrag(event: PointerEvent, id: PlaceableId): void {
    if (event.button !== 0 || drag || !interactive) return;
    const scale = unitsPerPixel();
    if (!scale) return;
    event.preventDefault();
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    (event.currentTarget as SVGElement).focus();
    drag = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, unitsPerPixel: scale, start: PLACEABLES[id].center(draft, context) };
    dragging = id;
    select(id);
  }

  function moveDrag(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    move(drag.id, { x: drag.start.x + (event.clientX - drag.x) * drag.unitsPerPixel, y: drag.start.y + (event.clientY - drag.y) * drag.unitsPerPixel });
  }

  function endDrag(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = undefined;
    dragging = undefined;
  }

  function handleItemKey(event: KeyboardEvent, id: PlaceableId): void {
    const size = PLACEABLES[id].resize;
    const grow = event.key === "+" || event.key === "=" ? 1 : event.key === "-" || event.key === "_" ? -1 : 0;
    if (grow && size) {
      event.preventDefault();
      event.stopPropagation();
      resize(id, size.value(draft) + grow * size.step * (event.shiftKey ? 5 : 1));
      return;
    }
    const step = event.shiftKey ? NUDGE_LARGE_MM : NUDGE_MM;
    const [dx, dy] = event.key === "ArrowLeft" ? [-step, 0] : event.key === "ArrowRight" ? [step, 0] : event.key === "ArrowUp" ? [0, -step] : event.key === "ArrowDown" ? [0, step] : [0, 0];
    if (!dx && !dy) return;
    event.preventDefault();
    event.stopPropagation();
    const from = PLACEABLES[id].center(draft, context);
    move(id, { x: from.x + dx, y: from.y + dy });
  }

  function handleKey(event: KeyboardEvent): void {
    if (!interactive) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
    else if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); event.stopPropagation(); onDone(); }
  }

  onMount(() => {
    // Start with the chosen item focused, so the arrow keys move it right away.
    void tick().then(() => svg.querySelector<SVGElement>(`[data-placeable="${session.selected}"]`)?.focus());
    const observer = new ResizeObserver(() => { pixel = unitsPerPixel() ?? pixel; });
    observer.observe(svg);
    return () => observer.disconnect();
  });
</script>

<!-- Escape and Enter here are shortcuts for the toolbar's Cancel and Done buttons. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="placement-layer" class:placement-layer--inert={!interactive} onkeydown={handleKey}>
  <svg bind:this={svg} viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`} data-placement-layer>
    {#each items as { placeable, grip, outline, markings } (placeable.id)}
      <g class="placement-item" class:placement-item--selected={session.selected === placeable.id} class:placement-item--dragging={dragging === placeable.id} data-placement-item={placeable.id}>
        {#each markings as marking (marking.id)}
          {#if marking.label && marking.points[0]}
            {@const text = labelPaths(marking)}
            {#if text.fill}<path d={text.fill} fill-rule="evenodd" fill={markingColor(marking)} />{:else}<path d={text.stroke} fill="none" stroke={markingColor(marking)} stroke-width={draft.lineStyle.annotationMm} stroke-linecap={text.round ? "round" : "butt"} stroke-linejoin={text.round ? "round" : "miter"} />{/if}
          {:else}
            <path d={markingPath(marking)} fill={marking.filled ? markingColor(marking) : "none"} fill-rule="evenodd" stroke={marking.filled ? "none" : markingColor(marking)} stroke-width={markingWidth(marking, draft.lineStyle)} />
          {/if}
        {/each}
        <path
          class="placement-handle" d={`${outline} Z`}
          data-placeable={placeable.id}
          role="button" tabindex="0"
          aria-label={`${placeable.label}. Drag to move, or use the arrow keys; hold Shift for bigger steps.${placeable.resize ? " Plus and minus change the size." : ""}`}
          aria-pressed={session.selected === placeable.id}
          onfocus={() => select(placeable.id)}
          onpointerdown={(event) => startDrag(event, placeable.id)} onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag} onlostpointercapture={endDrag}
          onkeydown={(event) => handleItemKey(event, placeable.id)}
        />
        {#if grip && session.selected === placeable.id}
          <!-- Pointer-only: the focused item resizes with plus and minus. -->
          <circle
            class="placement-grip" cx={grip.x} cy={grip.y} r={GRIP_PX * pixel}
            data-placement-grip={placeable.id} aria-hidden="true"
            onpointerdown={(event) => startResize(event, placeable.id)} onpointermove={moveResize} onpointerup={endResize} onpointercancel={endResize} onlostpointercapture={endResize}
          />
        {/if}
      </g>
    {/each}
  </svg>
  <div class="placement-toolbar" role="toolbar" aria-label="Placement" inert={!interactive}>
    <span class="placement-toolbar__icon" aria-hidden="true"><Move size={16} /></span>
    <span class="placement-toolbar__text">
      <span class="placement-toolbar__status" aria-live="polite">Placing <b>{selectedLabel}</b>{#if sizeReadout}<span class="placement-toolbar__size">{sizeReadout}</span>{/if}</span>
      <span class="placement-toolbar__hint">Drag to move{selected.resize ? " · corner to resize" : ""} · arrow keys nudge{selected.resize ? " · +/− size" : ""} · Tab switches</span>
    </span>
    <Button size="sm" onclick={onCancel}>Cancel</Button>
    <Button variant="primary" size="sm" onclick={onDone}>Done</Button>
  </div>
</div>
