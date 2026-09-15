<script lang="ts">
  import { onDestroy, onMount, type Snippet } from "svelte";
  import { IconButton } from "@loidolt/theme-svelte";
  import { Minus, Plus, RotateCcw } from "@lucide/svelte";

  let { widthMm, heightMm, label, svgLabel, controlsLabel, resetLabel, children }: {
    widthMm: number;
    heightMm: number;
    label: string;
    svgLabel: string;
    controlsLabel: string;
    resetLabel: string;
    children: Snippet;
  } = $props();

  // Use a compositor transform during gestures, then redraw the SVG sharply
  // once zoom settles. Both artwork modes share this camera and its controls.
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 6;
  const ZOOM_STEP = 0.5;
  const ZOOM_SETTLE_MS = 180;
  let viewport: HTMLButtonElement;
  let panLayer: HTMLSpanElement;
  let canvas: HTMLSpanElement;
  let zoom = $state(MIN_ZOOM);
  let renderZoom = $state(MIN_ZOOM);
  let panX = $state(0);
  let panY = $state(0);
  let dragging = $state(false);
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragStart: { pointerId: number; x: number; y: number; panX: number; panY: number; unitsPerPixel: number } | undefined;
  let dragFrame: number | undefined;
  let zoomCommitTimer: ReturnType<typeof setTimeout> | undefined;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let artworkSize = "";
  const baseX = $derived(-widthMm / 2 - 5);
  const baseY = $derived(-heightMm / 2 - 5);
  const baseWidth = $derived(widthMm + 10);
  const baseHeight = $derived(heightMm + 10);
  const residualScale = $derived(zoom / renderZoom);
  const visibleWidth = $derived(baseWidth / zoom);
  const visibleHeight = $derived(baseHeight / zoom);
  const renderWidth = $derived(baseWidth / renderZoom);
  const renderHeight = $derived(baseHeight / renderZoom);
  const renderX = $derived(baseX + (baseWidth - renderWidth) / 2 + panX);
  const renderY = $derived(baseY + (baseHeight - renderHeight) / 2 + panY);
  const viewBox = $derived(`${renderX} ${renderY} ${renderWidth} ${renderHeight}`);

  function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function cancelZoomCommit(): void {
    if (zoomCommitTimer === undefined) return;
    clearTimeout(zoomCommitTimer);
    zoomCommitTimer = undefined;
  }

  function commitVectorZoom(): void {
    cancelZoomCommit();
    renderZoom = zoom;
    setPan(panX, panY, zoom);
  }

  function scheduleVectorZoom(): void {
    cancelZoomCommit();
    zoomCommitTimer = setTimeout(() => {
      zoomCommitTimer = undefined;
      renderZoom = zoom;
      setPan(panX, panY, zoom);
    }, ZOOM_SETTLE_MS);
  }

  function clampedPan(x: number, y: number, scale = renderZoom): { x: number; y: number } {
    if (scale <= MIN_ZOOM) return { x: 0, y: 0 };
    const maximumX = (baseWidth - baseWidth / scale) / 2;
    const maximumY = (baseHeight - baseHeight / scale) / 2;
    return { x: clamp(x, -maximumX, maximumX), y: clamp(y, -maximumY, maximumY) };
  }

  function setPan(x: number, y: number, scale = renderZoom): void {
    const next = clampedPan(x, y, scale);
    panX = next.x;
    panY = next.y;
  }

  function setZoom(value: number): void {
    const next = clamp(value, MIN_ZOOM, MAX_ZOOM);
    if (next === zoom) return;
    zoom = next;
    scheduleVectorZoom();
  }

  function panUnitsPerPixel(): number | undefined {
    const scale = Math.min(canvasWidth / renderWidth, canvasHeight / renderHeight) * residualScale;
    return Number.isFinite(scale) && scale > 0 ? scale : undefined;
  }

  function cancelDragFrame(): void {
    if (dragFrame === undefined) return;
    cancelAnimationFrame(dragFrame);
    dragFrame = undefined;
  }

  function resetDragLayer(): void {
    cancelDragFrame();
    dragOffsetX = 0;
    dragOffsetY = 0;
    if (panLayer) panLayer.style.transform = "translate3d(0, 0, 0)";
  }

  function scheduleDragFrame(): void {
    if (dragFrame !== undefined) return;
    dragFrame = requestAnimationFrame(() => {
      dragFrame = undefined;
      panLayer.style.transform = `translate3d(${dragOffsetX}px, ${dragOffsetY}px, 0)`;
    });
  }

  function resetView(): void {
    if (dragStart && viewport.hasPointerCapture(dragStart.pointerId)) viewport.releasePointerCapture(dragStart.pointerId);
    dragStart = undefined;
    dragging = false;
    cancelZoomCommit();
    zoom = MIN_ZOOM;
    renderZoom = MIN_ZOOM;
    panX = 0;
    panY = 0;
    resetDragLayer();
  }

  function handleWheel(event: WheelEvent): void {
    event.preventDefault();
    setZoom(zoom * Math.exp(-event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1) * 0.0015));
  }

  function startPan(event: PointerEvent): void {
    if (event.button !== 0 || zoom <= MIN_ZOOM || dragStart) return;
    cancelZoomCommit();
    const scale = panUnitsPerPixel();
    if (scale === undefined) return;
    viewport.setPointerCapture(event.pointerId);
    resetDragLayer();
    dragging = true;
    dragStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX, panY, unitsPerPixel: 1 / scale };
  }

  function movePan(event: PointerEvent): void {
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    dragOffsetX = event.clientX - dragStart.x;
    dragOffsetY = event.clientY - dragStart.y;
    scheduleDragFrame();
  }

  function finishPan(event: PointerEvent): void {
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    const finalOffsetX = event.type === "pointerup" ? event.clientX - dragStart.x : dragOffsetX;
    const finalOffsetY = event.type === "pointerup" ? event.clientY - dragStart.y : dragOffsetY;
    const nextX = dragStart.panX - finalOffsetX * dragStart.unitsPerPixel;
    const nextY = dragStart.panY - finalOffsetY * dragStart.unitsPerPixel;
    dragStart = undefined;
    dragging = false;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
    resetDragLayer();
    commitVectorZoom();
    setPan(nextX, nextY, zoom);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "+" || event.key === "=") setZoom(zoom + ZOOM_STEP);
    else if (event.key === "-" || event.key === "_") setZoom(zoom - ZOOM_STEP);
    else if (event.key === "0" || event.key === "Home") resetView();
    else if (event.key === "ArrowLeft") { commitVectorZoom(); setPan(panX - visibleWidth * 0.1, panY, zoom); }
    else if (event.key === "ArrowRight") { commitVectorZoom(); setPan(panX + visibleWidth * 0.1, panY, zoom); }
    else if (event.key === "ArrowUp") { commitVectorZoom(); setPan(panX, panY - visibleHeight * 0.1, zoom); }
    else if (event.key === "ArrowDown") { commitVectorZoom(); setPan(panX, panY + visibleHeight * 0.1, zoom); }
    else return;
    event.preventDefault();
  }

  $effect(() => {
    const nextSize = `${widthMm}:${heightMm}`;
    if (artworkSize && artworkSize !== nextSize) resetView();
    artworkSize = nextSize;
  });

  onMount(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      canvasWidth = entry.contentRect.width;
      canvasHeight = entry.contentRect.height;
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  });

  onDestroy(() => {
    cancelZoomCommit();
    cancelDragFrame();
  });

</script>

<div class="svg-viewer">
  <div class="svg-zoom-controls" aria-label={controlsLabel}>
    <IconButton label="Zoom out" size="sm" disabled={zoom <= MIN_ZOOM} onclick={() => setZoom(zoom - ZOOM_STEP)}><Minus size={15} /></IconButton>
    <span class="svg-zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</span>
    <IconButton label="Zoom in" size="sm" disabled={zoom >= MAX_ZOOM} onclick={() => setZoom(zoom + ZOOM_STEP)}><Plus size={15} /></IconButton>
    <IconButton label={resetLabel} size="sm" disabled={zoom === MIN_ZOOM && panX === 0 && panY === 0} onclick={resetView}><RotateCcw size={14} /></IconButton>
  </div>
  <button
    type="button"
    bind:this={viewport}
    class="svg-viewport" class:dragging
    data-svg-viewport
    data-zoom={zoom.toFixed(2)}
    data-render-zoom={renderZoom.toFixed(2)}
    data-rendering={zoom === renderZoom ? "sharp" : "preview"}
    aria-label={`Interactive ${label} preview. Scroll or use plus and minus to zoom, drag or use arrow keys to pan, and press zero to reset.`}
    onwheel={handleWheel}
    onpointerdown={startPan}
    onpointermove={movePan}
    onpointerup={finishPan}
    onpointercancel={finishPan}
    onlostpointercapture={finishPan}
    onkeydown={handleKeyDown}
  >
    <span bind:this={panLayer} class="svg-pan-layer">
    <span bind:this={canvas} class="svg-canvas" style:transform={`scale(${residualScale})`}>
  <svg viewBox={viewBox} role="img" aria-label={svgLabel}>
    {@render children()}
  </svg>
    </span>
    </span>
  </button>
</div>

<style>
.svg-viewer { position: relative; width: 100%; height: 100%; min-width: 0; min-height: 0; }
.svg-viewport.dragging { cursor: grabbing; }
.svg-viewport {
  width: 100%;
  height: 100%;
  min-height: 0;
  position: relative;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: initial;
}

.svg-viewport:focus-visible {
  outline: 2px solid var(--loidolt-accent);
  outline-offset: -2px;
}

.svg-pan-layer {
  width: 100%;
  height: 100%;
  display: flex;
  transform: translate3d(0, 0, 0);
  will-change: transform;
  contain: layout paint;
}

.svg-canvas {
  width: var(--svg-canvas-width, min(90%, 1040px));
  height: var(--svg-canvas-height, min(100%, 760px));
  margin: auto;
  display: flex;
  transform-origin: center;
  will-change: transform;
  backface-visibility: hidden;
}

.svg-canvas svg {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: visible;
  pointer-events: none;
}

.svg-zoom-controls {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: color-mix(in srgb, var(--loidolt-surface) 90%, transparent);
  border: var(--loidolt-border-width) solid var(--loidolt-border);
  box-shadow: var(--loidolt-shadow-popover);
}

.svg-zoom-value {
  min-width: 48px;
  height: 28px;
  color: var(--loidolt-text-muted);
  font: 9px var(--loidolt-font-utility);
  display: grid;
  place-items: center;
}

</style>
