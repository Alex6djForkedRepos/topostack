import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT, generateGeometry, type GeometryIRV1 } from "@topostack/core";
import { createSamplePreviewSource } from "../sample-preview";

const three = vi.hoisted(() => ({ renderers: [] as Array<{ dispose: ReturnType<typeof vi.fn>; forceContextLoss: ReturnType<typeof vi.fn>; render: ReturnType<typeof vi.fn> }> }));
vi.mock("three", async (importOriginal) => {
  const original = await importOriginal<typeof import("three")>();
  class FakeRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0 };
    toneMapping = 0; toneMappingExposure = 1; outputColorSpace = "";
    setPixelRatio = vi.fn(); setSize = vi.fn(); render = vi.fn(); dispose = vi.fn(); forceContextLoss = vi.fn();
    constructor() { three.renderers.push(this); }
  }
  class FakePmrem {
    fromScene() { return { texture: new original.Texture(), dispose: vi.fn() }; }
    dispose() {}
  }
  return { ...original, WebGLRenderer: FakeRenderer, PMREMGenerator: FakePmrem };
});

const maplibre = vi.hoisted(() => ({ maps: [] as Array<{ remove: ReturnType<typeof vi.fn>; emit: (type: string, event?: unknown) => void }> }));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url", () => ({ default: "maplibre-worker.js" }));
vi.mock("maplibre-gl", () => {
  class FakeMap {
    private handlers = new Map<string, Array<(event?: unknown) => void>>();
    remove = vi.fn();
    touchZoomRotate = { disableRotation: vi.fn() };
    constructor() { maplibre.maps.push(this); }
    on(type: string, handler: (event?: unknown) => void) { this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]); return this; }
    once(type: string, handler: (event?: unknown) => void) { return this.on(type, handler); }
    emit(type: string, event: unknown = {}) { for (const handler of this.handlers.get(type) ?? []) handler(event); }
    addControl() { return this; }
    getZoom() { return 11; }
    getCenter() { return { lng: 0, lat: 0 }; }
    isStyleLoaded() { return false; }
    resize() { return this; }
    fitBounds() { return this; }
    stop() { return this; }
    unproject() { return { lng: 0, lat: 0 }; }
  }
  class Control {}
  return { Map: FakeMap, NavigationControl: Control, AttributionControl: Control, Marker: class { setLngLat() { return this; } addTo() { return this; } remove() {} getElement() { return document.createElement("div"); } }, setWorkerUrl: vi.fn() };
});

import MapCanvas from "./MapCanvas.svelte";
import ThreePreview from "./ThreePreview.svelte";
import ThreePreviewHost from "./ThreePreviewHost.svelte";
import * as THREE from "three";

describe("preview resource cleanup", () => {
  let component: ReturnType<typeof mount> | undefined;
  beforeAll(() => {
    Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: class { observe() {} disconnect() {} unobserve() {} } });
    // jsdom has no 2D canvas; the wood texture only needs drawing calls to exist.
    const context = new Proxy({}, { get: (_target, key) => key === "createLinearGradient" ? () => ({ addColorStop() {} }) : () => undefined, set: () => true });
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value: () => context });
  });
  afterEach(async () => { if (component) await unmount(component); component = undefined; three.renderers.length = 0; maplibre.maps.length = 0; });

  it("merges markings into per-material draw calls and releases GPU resources on unmount", async () => {
    const geometry = generateGeometry({ ...DEFAULT_PROJECT, showTransportationLabels: true }, createSamplePreviewSource());
    const shadowDispose = vi.spyOn(THREE.LightShadow.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.Material.prototype, "dispose");
    const target = document.createElement("div");
    document.body.append(target);
    component = mount(ThreePreview, { target, props: { geometry, exploded: 0 } });
    flushSync();
    const renderer = three.renderers[0]!;
    // The scene rebuild is deferred briefly so rapid edits do not re-extrude.
    await vi.waitFor(() => expect(renderer.render.mock.calls.some(([scene]) => {
      let lines = 0;
      (scene as THREE.Scene).traverse((object) => { if (object instanceof THREE.Line) lines += 1; });
      return lines > 0;
    })).toBe(true));
    const scene = renderer.render.mock.lastCall![0] as THREE.Scene;
    let lineObjects = 0;
    let segments = 0;
    scene.traverse((object) => {
      if (!(object instanceof THREE.Line)) return;
      lineObjects += 1;
      if ((object.material as THREE.LineBasicMaterial).color.getHex() !== 0x21170f) segments += object.geometry.getAttribute("position").count / 2;
    });
    const polylines = geometry.layers.flatMap((layer) => layer.markings.filter((marking) => !marking.filled && marking.points.length > 1));
    // Every segment survives batching, in far fewer objects than one per marking.
    expect(segments).toBe(polylines.reduce((total, marking) => total + marking.points.length - 1, 0));
    expect(lineObjects).toBeLessThan(polylines.length);
    expect(lineObjects).toBeLessThanOrEqual(geometry.layers.length * 9);

    await unmount(component);
    component = undefined;
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(renderer.forceContextLoss).toHaveBeenCalledOnce();
    expect(shadowDispose).toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalled();
    shadowDispose.mockRestore(); materialDispose.mockRestore();
    target.remove();
  });

  it("re-extrudes only the layers whose cut polygons changed, and still frees them", async () => {
    const geometry = generateGeometry(DEFAULT_PROJECT, createSamplePreviewSource());
    const target = document.createElement("div");
    document.body.append(target);
    component = mount(ThreePreviewHost, { target, props: { initial: geometry } });
    const host = component as unknown as { setGeometry: (next: GeometryIRV1) => void };
    flushSync();
    const renderer = three.renderers[0]!;
    // Layer bodies are the only meshes with a [face, side] material pair.
    const bodies = () => {
      const scene = renderer.render.mock.lastCall![0] as THREE.Scene;
      const meshes: THREE.Mesh[] = [];
      scene.traverse((object) => { if (object instanceof THREE.Mesh && Array.isArray(object.material)) meshes.push(object); });
      return meshes;
    };
    await vi.waitFor(() => { expect(renderer.render).toHaveBeenCalled(); expect(bodies().length).toBeGreaterThan(1); });
    const extrusions = bodies().map((mesh) => mesh.geometry);
    const rebuilt = async (next: GeometryIRV1) => {
      const before = renderer.render.mock.calls.length;
      host.setGeometry(next);
      flushSync();
      await vi.waitFor(() => expect(renderer.render.mock.calls.length).toBeGreaterThan(before));
    };

    // A line-width edit arrives as a fresh worker result: identical cut
    // polygons in brand-new objects, so nothing may be re-triangulated.
    const restyled = structuredClone(geometry);
    restyled.lineStyle = { ...restyled.lineStyle, annotationMm: geometry.lineStyle.annotationMm + 0.1 };
    await rebuilt(restyled);
    expect(bodies().map((mesh) => mesh.geometry)).toHaveLength(extrusions.length);
    expect(bodies().every((mesh, index) => mesh.geometry === extrusions[index])).toBe(true);

    // Moving one vertex rebuilds that layer alone.
    const moved = structuredClone(geometry);
    const changed = moved.layers.findIndex((layer, index) => index > 0 && layer.polygons[0]?.outer.length);
    expect(changed).toBeGreaterThan(0);
    moved.layers[changed]!.polygons[0]!.outer[0]!.x += 1.5;
    await rebuilt(moved);
    const after = bodies();
    expect(after[0]!.geometry).toBe(extrusions[0]);
    expect(after.some((mesh, index) => mesh.geometry !== extrusions[index])).toBe(true);

    // Cached bodies are owned by the preview, not by the rebuild that made
    // them, so unmount has to free them as well.
    const disposals = [vi.spyOn(extrusions[0]!, "dispose"), ...(after[0]!.material as THREE.Material[]).map((material) => vi.spyOn(material, "dispose"))];
    await unmount(component);
    component = undefined;
    for (const dispose of disposals) expect(dispose).toHaveBeenCalled();
    target.remove();
  });

  it("removes the map on unmount and reports only a style that never loaded", async () => {
    const onUnavailable = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const target = document.createElement("div");
    component = mount(MapCanvas, { target, props: { project: DEFAULT_PROJECT, onUnavailable, onSelectionResize: vi.fn(), onLocationChange: vi.fn() } });
    flushSync();
    const map = maplibre.maps[0]!;
    map.emit("error", { sourceId: "openmaptiles", tile: {}, error: new Error("Tile 503") });
    expect(onUnavailable).not.toHaveBeenCalled();
    map.emit("error", { error: new Error("Style fetch failed") });
    map.emit("error", { error: new Error("Style fetch failed again") });
    expect(onUnavailable).toHaveBeenCalledExactlyOnceWith("load-failed");
    await unmount(component);
    component = undefined;
    expect(map.remove).toHaveBeenCalledOnce();
    warn.mockRestore();

    const loaded = mount(MapCanvas, { target, props: { project: DEFAULT_PROJECT, onUnavailable, onSelectionResize: vi.fn(), onLocationChange: vi.fn() } });
    flushSync();
    const second = maplibre.maps[1]!;
    second.emit("load");
    second.emit("error", { error: new Error("Glyphs unavailable") });
    expect(onUnavailable).toHaveBeenCalledOnce();
    await unmount(loaded);
  });
});
