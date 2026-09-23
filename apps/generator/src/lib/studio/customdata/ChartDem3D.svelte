<script lang="ts">
  import { onMount } from "svelte";
  import { type ChartGridV1 } from "@topostack/data-contracts/chart-bathymetry";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { chartSurface, automaticDepthExaggeration } from "./chart-surface";

  let { grid, onUnavailable }: { grid: ChartGridV1; onUnavailable: () => void } = $props();
  let host: HTMLDivElement;
  let exaggeration = $state("auto");
  let automatic = $state(1);
  const depthScale = $derived(exaggeration === "auto" ? automatic : Number(exaggeration));
  let reset = () => {};
  let zoom: (factor: number) => void = () => {};
  let rotate = () => {};
  let updateScale: (value: number) => void = () => {};
  $effect(() => { updateScale(depthScale); });

  onMount(() => {
    const resources: Array<() => void> = [];
    const dispose = () => { for (const cleanup of resources.reverse()) cleanup(); };
    try {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      resources.push(() => { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      host.append(renderer.domElement);
      const lost = (event: Event) => { event.preventDefault(); onUnavailable(); };
      renderer.domElement.addEventListener("webglcontextlost", lost);
      resources.push(() => renderer.domElement.removeEventListener("webglcontextlost", lost));
      const data = chartSurface(grid);
      automatic = automaticDepthExaggeration(data.deepest, data.scale);
      if (!data.indices.length) throw new Error("No surface triangles");
      const geometry = new THREE.BufferGeometry();
      resources.push(() => geometry.dispose());
      geometry.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      geometry.computeVertexNormals();
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
      resources.push(() => material.dispose());
      const mesh = new THREE.Mesh(geometry, material);
      const scene = new THREE.Scene();
      const reference = new THREE.GridHelper(2.1, 6, 0x72899b, 0xa7b5c0);
      reference.material.transparent = true;
      reference.material.opacity = 0.25;
      scene.add(reference);
      resources.push(() => { reference.geometry.dispose(); reference.material.dispose(); });
      scene.add(mesh, new THREE.HemisphereLight(0xffffff, 0x506080, 1.2));
      const light = new THREE.DirectionalLight(0xffffff, 2.5);
      light.position.set(-2, 5, 3); scene.add(light);
      const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
      const controls = new OrbitControls(camera, renderer.domElement);
      resources.push(() => controls.dispose());
      controls.maxPolarAngle = Math.PI / 2;
      controls.minDistance = 0.2;
      const render = () => renderer.render(scene, camera);
      controls.addEventListener("change", render);
      reset = () => {
        const depth = data.deepest * data.scale * depthScale;
        controls.target.set(0, -depth / 2, 0);
        const distance = Math.max(2.6, (1.8 + depth) / Math.min(camera.aspect, 1));
        camera.position.set(distance * 0.45, distance * 0.65 - depth / 2, distance * 0.85);
        camera.far = Math.max(1000, distance * 10); camera.updateProjectionMatrix();
        controls.update(); render();
      };
      zoom = (factor) => { camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target); controls.update(); };
      rotate = () => { camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6).add(controls.target); controls.update(); };
      updateScale = (value) => { mesh.scale.y = value; reset(); };
      updateScale(depthScale);
      const resize = () => {
        const { width, height } = host.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setSize(width, height, false);
        camera.aspect = width / height; camera.updateProjectionMatrix(); reset();
      };
      const observer = new ResizeObserver(resize);
      resources.push(() => observer.disconnect()); observer.observe(host);
      resize(); reset();
    } catch {
      dispose(); onUnavailable(); return;
    }
    return dispose;
  });
</script>

<div class="depth-viewer">
<div class="dem-3d" bind:this={host} role="img" aria-label="Generated lake bed in 3D. Depths extend below the water surface. Use the toolbar to change surface style, rotate and zoom."></div>
<div class="depth-controls">
  <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" onclick={() => rotate()}>Rotate</button>
  <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" aria-label="Zoom in" title="Zoom in" onclick={() => zoom(0.8)}>+</button>
  <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" aria-label="Zoom out" title="Zoom out" onclick={() => zoom(1.25)}>−</button>
  <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" onclick={() => reset()}>Reset view</button>
  <label title="Vertical exaggeration changes only this preview">Depth
    <select class="ldt-input" bind:value={exaggeration} aria-label="Vertical exaggeration">
      <option value="auto">Auto · {automatic.toFixed(1)}×</option><option value="1">1× · true scale</option><option value="5">5×</option><option value="10">10×</option><option value="20">20×</option>
    </select>
  </label>
</div>
<p class="chart-hint">Drag to orbit · depth {depthScale.toFixed(1)}× (preview only)</p>
</div>

<style>
  .depth-viewer { display: flex; flex-direction: column; height: 100%; min-height: 0; }
  .dem-3d { position: relative; flex: 1; min-height: 0; width: 100%; background: var(--loidolt-surface-alt); overflow: hidden; }
  .dem-3d :global(canvas) { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none; }
  .depth-controls { order: -1; display: flex; gap: 4px; flex-wrap: wrap; align-items: center; padding: 4px 8px; border-bottom: 1px solid var(--loidolt-border); font-size: 11px; }
  .depth-controls :global(button) { min-height: 26px; padding: 3px 7px; font-size: 10px; }
  select { width: auto; min-width: 0; max-width: 130px; min-height: 26px; padding-block: 2px; font-size: 11px; }
  label { display: flex; gap: 4px; align-items: center; margin-left: auto; }
  .chart-hint { padding: 4px 8px; font-size: 11px; border-top: 1px solid var(--loidolt-border); }
</style>
