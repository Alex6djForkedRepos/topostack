<script lang="ts">
  import { onMount, untrack, getContext } from "svelte";
  import { base } from "$app/paths";
  import { LocateFixed } from "@lucide/svelte";
  import * as maplibregl from "maplibre-gl";
  import mapWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
  import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
  import { MAX_PROJECT_DIMENSION_MM, markerSymbolCenterForAnchor, markerSymbolPaths, unwrapLongitude, type CustomLineFeatureV1, type GeoBounds, type MapMarkerV1, type MarkerSymbol, type ProjectConfigV1 } from "@topostack/core";
  import { boundsForProject } from "../data-provider";
  let { project, onLocationChange, onSelectionResize, onUnavailable }: { project: ProjectConfigV1; onSelectionResize: (widthMm: number, heightMm: number, bounds: GeoBounds) => void; onUnavailable?: () => void; onLocationChange: (lat: number, lon: number, zoom: number, bounds: GeoBounds) => void } = $props();
  import AtommZoom from "./AtommZoom.svelte";
  const isEmbedded = getContext<() => boolean>("atomm-embedded") ?? (() => false);
  let zoomScale = $state(1);
  let initialZoom = 10;
  let initialCenter: [number, number] = [0, 0];
  function setZoomScale(value: number) { map?.jumpTo({ zoom: initialZoom + Math.log2(value) }); }
  function resetMapView() { map?.jumpTo({ center: initialCenter, zoom: initialZoom }); }
  let container: HTMLDivElement;
  let guide: HTMLDivElement;
  let map: MapLibreMap | undefined;
  const mapMarkers = new Map<string, maplibregl.Marker>();
  const isCircle = $derived(project.cropShape === "circle");
  const CUSTOM_SOURCE_ID = "topostack-custom-lines";
  const CUSTOM_TRAIL_LAYER_ID = "topostack-custom-trails";
  const CUSTOM_BOUNDARY_LAYER_ID = "topostack-custom-boundaries";
  const MARKER_SYMBOL_SIZE = 22;
  const MARKER_VIEWBOX_SIZE = 26;
  const MARKER_ELEMENT_SIZE_PX = 30;

  let aspectLocked = $state(false);
  let resizing = $state(false);
  let skipSelectionFit = false;
  const handles = [
    { name: "top left", x: -1, y: -1 }, { name: "top", x: 0, y: -1 },
    { name: "top right", x: 1, y: -1 }, { name: "right", x: 1, y: 0 },
    { name: "bottom right", x: 1, y: 1 }, { name: "bottom", x: 0, y: 1 },
    { name: "bottom left", x: -1, y: 1 }, { name: "left", x: -1, y: 0 },
  ];
  let drag: { pointerId: number; x: number; y: number; width: number; height: number; widthMm: number; heightMm: number; handle: typeof handles[number] } | undefined;

  function startResize(event: PointerEvent, handle: typeof handles[number]): void {
    if (!map || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    map.stop();
    const rect = guide.getBoundingClientRect();
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, widthMm: project.widthMm, heightMm: project.heightMm, handle };
    resizing = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveResize(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { width, height, handle, widthMm, heightMm } = drag;
    let sx = handle.x ? 1 + 2 * handle.x * (event.clientX - drag.x) / width : 1;
    let sy = handle.y ? 1 + 2 * handle.y * (event.clientY - drag.y) / height : 1;
    const maxX = Math.min((container.clientWidth - 32) / width, MAX_PROJECT_DIMENSION_MM / widthMm);
    const maxY = Math.min((container.clientHeight - 96) / height, MAX_PROJECT_DIMENSION_MM / heightMm);
    const minX = Math.min(1, 32 / width);
    const minY = Math.min(1, 32 / height);
    if (aspectLocked || event.shiftKey || isCircle) {
      // Project the pointer onto the aspect-ratio diagonal. Switching to the
      // axis with the largest delta jumps when one shrinks and the other grows.
      const scale = !handle.x ? sy : !handle.y ? sx : (sx * width * width + sy * height * height) / (width * width + height * height);
      sx = sy = Math.max(Math.max(minX, minY), Math.min(scale, maxX, maxY));
    } else {
      sx = Math.max(minX, Math.min(sx, maxX));
      sy = Math.max(minY, Math.min(sy, maxY));
    }
    guide.style.width = `${width * sx}px`;
    guide.style.height = `${height * sy}px`;
  }

  function finishResize(cancel = false): void {
    if (!drag || !map) return;
    const start = drag;
    drag = undefined;
    resizing = false;
    if (cancel) { guide.style.width = `${start.width}px`; guide.style.height = `${start.height}px`; return; }
    const rect = guide.getBoundingClientRect();
    if (Math.abs(rect.width - start.width) < 0.01 && Math.abs(rect.height - start.height) < 0.01) return;
    const origin = container.getBoundingClientRect();
    const nw = map.unproject([rect.left - origin.left, rect.top - origin.top]);
    const se = map.unproject([rect.right - origin.left, rect.bottom - origin.top]);
    const shift = project.location.lon - map.getCenter().lng;
    skipSelectionFit = true;
    onSelectionResize(start.widthMm * rect.width / start.width, start.heightMm * rect.height / start.height,
      { west: nw.lng + shift, east: se.lng + shift, north: nw.lat, south: se.lat });
  }

  function markerPixelOffset(symbol: MarkerSymbol): [number, number] {
    const center = markerSymbolCenterForAnchor(symbol, { x: 0, y: 0 }, MARKER_SYMBOL_SIZE);
    const scale = MARKER_ELEMENT_SIZE_PX / MARKER_VIEWBOX_SIZE;
    return [center.x * scale, center.y * scale];
  }

  function markerElement(marker: MapMarkerV1): HTMLDivElement {
    const element = document.createElement("div");
    element.className = "topostack-map-marker";
    element.dataset.symbol = marker.symbol;
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", `${marker.symbol} marker at ${marker.lat.toFixed(5)}, ${marker.lon.toFixed(5)}`);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "-13 -13 26 26");
    svg.setAttribute("aria-hidden", "true");
    for (const points of markerSymbolPaths(marker.symbol, { x: 0, y: 0 }, MARKER_SYMBOL_SIZE)) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" "));
      svg.append(path);
    }
    element.append(svg);
    return element;
  }

  function fitSelection(): void {
    if (!map || !guide || resizing) return;
    const bounds = boundsForProject(project);
    const aspect = project.widthMm / project.heightMm;
    const width = Math.min(container.clientWidth * 0.54, 630, container.clientHeight * 0.7 * aspect);
    const height = width / aspect;
    if (!(width > 0 && height > 0)) return;
    guide.style.width = `${width}px`;
    guide.style.height = `${height}px`;
    map.resize({ topostackProgrammatic: true });
    map.fitBounds([[bounds.west, bounds.south], [bounds.east, bounds.north]], {
      padding: { left: (container.clientWidth - width) / 2, right: (container.clientWidth - width) / 2, top: (container.clientHeight - height) / 2, bottom: (container.clientHeight - height) / 2 },
      duration: 0, bearing: 0, pitch: 0,
    }, { topostackProgrammatic: true });
  }

  function customLineData(lines: CustomLineFeatureV1[]) {
    const longitudeBounds = project.location.bounds ?? { west: project.location.lon - 180, east: project.location.lon + 180, south: -85.0511, north: 85.0511 };
    return {
      type: "FeatureCollection" as const,
      features: lines.map((line) => ({
        type: "Feature" as const,
        properties: { id: line.id, kind: line.kind },
        geometry: { type: "LineString" as const, coordinates: line.points.map((point) => [unwrapLongitude(point.lon, longitudeBounds), point.lat] as [number, number]) },
      })),
    };
  }

  function syncCustomLines(lines: CustomLineFeatureV1[]): void {
    if (!map || !map.isStyleLoaded()) return;
    const data = customLineData(lines);
    const source = map.getSource(CUSTOM_SOURCE_ID) as GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
      return;
    }
    map.addSource(CUSTOM_SOURCE_ID, { type: "geojson", data });
    map.addLayer({
      id: CUSTOM_BOUNDARY_LAYER_ID,
      type: "line",
      source: CUSTOM_SOURCE_ID,
      filter: ["==", ["get", "kind"], "boundary"],
      paint: { "line-color": "#75415d", "line-width": 3, "line-dasharray": [7, 4] },
      layout: { "line-cap": "round", "line-join": "round" },
    });
    map.addLayer({
      id: CUSTOM_TRAIL_LAYER_ID,
      type: "line",
      source: CUSTOM_SOURCE_ID,
      filter: ["==", ["get", "kind"], "trail"],
      paint: { "line-color": "#b8682d", "line-width": 3, "line-dasharray": [3, 2] },
      layout: { "line-cap": "round", "line-join": "round" },
    });
  }

  onMount(() => {
    // MapLibre 6 needs an explicit worker URL with bundlers. Use Vite's worker
    // pipeline so the worker's shared-module imports are bundled for production.
    maplibregl.setWorkerUrl(mapWorkerUrl);
    try {
      map = new maplibregl.Map({ container, style: "https://tiles.openfreemap.org/styles/liberty", center: [project.location.lon, project.location.lat], zoom: project.location.zoom, attributionControl: false, cooperativeGestures: true, dragRotate: false, touchPitch: false, trackResize: false });
    } catch { onUnavailable?.(); return; }
    map.touchZoomRotate.disableRotation();
    if (!isEmbedded()) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    initialZoom = map.getZoom(); initialCenter = [project.location.lon, project.location.lat];
    map.on("zoom", () => { if (map) zoomScale = 2 ** (map.getZoom() - initialZoom); });
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: `<a href="${base}/attribution" target="_blank" rel="noopener noreferrer">All sources</a>` }), "bottom-left");
    map.on("load", () => syncCustomLines(project.customLines));
    const emitSelection = () => {
      if (!map) return;
      const center = map.getCenter();
      const containerRect = container.getBoundingClientRect();
      const guideRect = guide.getBoundingClientRect();
      const northWest = map.unproject([guideRect.left - containerRect.left, guideRect.top - containerRect.top]);
      const southEast = map.unproject([guideRect.right - containerRect.left, guideRect.bottom - containerRect.top]);
      const longitude = ((center.lng + 180) % 360 + 360) % 360 - 180;
      const worldShift = longitude - center.lng;
      // This location already reflects the camera and guide on screen.
      // Do not fit it back into the default-sized guide after a pan or zoom.
      skipSelectionFit = true;
      onLocationChange(center.lat, longitude, map.getZoom(), { west: northWest.lng + worldShift, north: northWest.lat, east: southEast.lng + worldShift, south: southEast.lat });
    };
    // Only commit selections for movement the user caused. Programmatic camera
    // moves (initial load, flyTo from external location edits) must not
    // overwrite the stored place label or bounds.
    map.on("moveend", (event) => { if ((event as unknown as { topostackProgrammatic?: boolean }).topostackProgrammatic) return; emitSelection(); });
    const resizeObserver = new ResizeObserver(() => fitSelection());
    resizeObserver.observe(container);
    fitSelection();
    return () => { resizeObserver.disconnect(); mapMarkers.forEach((marker) => marker.remove()); mapMarkers.clear(); map?.remove(); map = undefined; };
  });

  $effect(() => {
    void project.location;
    void project.cropShape;
    void project.widthMm;
    void project.heightMm;
    untrack(() => { if (skipSelectionFit) { skipSelectionFit = false; return; } fitSelection(); });
  });

  $effect(() => {
    const configuredMarkers = project.markers;
    if (!map) return;
    const activeIds = new Set(configuredMarkers.map((marker) => marker.id));
    for (const [id, rendered] of mapMarkers) {
      if (!activeIds.has(id)) { rendered.remove(); mapMarkers.delete(id); }
    }
    for (const marker of configuredMarkers) {
      let rendered = mapMarkers.get(marker.id);
      if (rendered?.getElement().dataset.symbol !== marker.symbol) {
        rendered?.remove();
        rendered = undefined;
      }
      if (!rendered) {
        rendered = new maplibregl.Marker({ element: markerElement(marker), anchor: "center", offset: markerPixelOffset(marker.symbol) }).setLngLat([marker.lon, marker.lat]).addTo(map);
        mapMarkers.set(marker.id, rendered);
      } else {
        rendered.setLngLat([marker.lon, marker.lat]);
        rendered.getElement().setAttribute("aria-label", `${marker.symbol} marker at ${marker.lat.toFixed(5)}, ${marker.lon.toFixed(5)}`);
      }
    }
  });

  $effect(() => {
    const lines = project.customLines;
    syncCustomLines(lines);
  });
</script>

<svelte:window onkeydown={(event) => { if (event.key === "Escape") finishResize(true); }} onblur={() => finishResize(true)} />

<div class="map-wrap">
  <div bind:this={container} class="map-canvas"></div>
  <div class="selection-tools">
    <label><input type="checkbox" bind:checked={aspectLocked} disabled={isCircle} /> {isCircle ? "Circle proportions locked" : "Lock aspect ratio"}</label>
    <span>Drag handles to resize · Hold Shift to lock · Esc to cancel</span>
  </div>
  <div bind:this={guide} class="crop-guide" class:crop-circle={isCircle}>
    {#if isCircle}<div class="circle-outline"></div>{/if}
    {#each handles as handle}
      <button type="button" class="resize-handle" aria-label={`Resize selection ${handle.name}`} title={`Resize ${handle.name} (arrow keys supported)`}
        style:left={`${(handle.x + 1) * 50}%`} style:top={`${(handle.y + 1) * 50}%`}
        style:cursor={handle.x === 0 ? "ns-resize" : handle.y === 0 ? "ew-resize" : handle.x === handle.y ? "nwse-resize" : "nesw-resize"}
        onpointerdown={(event) => startResize(event, handle)} onpointermove={moveResize}
        onpointerup={() => finishResize()} onpointercancel={() => finishResize(true)} onlostpointercapture={() => finishResize(true)}
        onkeydown={(event) => {
          if (!map || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          const rect = guide.getBoundingClientRect();
          drag = { pointerId: -1, x: 0, y: 0, width: rect.width, height: rect.height, widthMm: project.widthMm, heightMm: project.heightMm, handle };
          moveResize({ pointerId: -1, clientX: event.key === "ArrowLeft" ? -5 : event.key === "ArrowRight" ? 5 : 0, clientY: event.key === "ArrowUp" ? -5 : event.key === "ArrowDown" ? 5 : 0, shiftKey: event.shiftKey } as PointerEvent);
          finishResize();
        }}></button>
    {/each}
  </div>
  <div class="map-crosshair"><span></span><span></span></div>
  {#if isEmbedded()}<AtommZoom value={zoomScale} min={0.125} max={16} onZoom={setZoomScale} onFit={resetMapView} />{/if}
  <div class="map-caption"><LocateFixed size={14} /> Drag the map to choose your terrain</div>
</div>

<style>
  .crop-guide { box-sizing: border-box; }
  .selection-tools { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 3; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding: 8px 10px; background: var(--loidolt-surface); color: var(--loidolt-text); border-radius: 6px; font-size: 12px; }
  .selection-tools label { display: flex; align-items: center; gap: 6px; }
  .resize-handle { position: absolute; transform: translate(-50%, -50%); width: 20px; height: 20px; min-width: 0; padding: 0; border: 2px solid var(--loidolt-accent); border-radius: 3px; background: white; pointer-events: auto; touch-action: none; }
  .resize-handle:focus-visible { outline: 3px solid var(--loidolt-accent); outline-offset: 3px; }
  .circle-outline {
    width: 100%; height: 100%;
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    border: 2px solid white;
    border-radius: 50%;
    box-shadow: 0 0 0 9999px #20231d61;
  }

  :global(.topostack-map-marker) {
    width: 30px;
    height: 30px;
    color: #b84824;
    filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.55));
    pointer-events: none;
  }

  :global(.topostack-map-marker svg) {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
    fill: currentColor;
    stroke: #fff;
    stroke-width: 4.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    paint-order: stroke fill;
  }
</style>
