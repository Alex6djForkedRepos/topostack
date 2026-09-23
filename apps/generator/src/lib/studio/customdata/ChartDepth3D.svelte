<script lang="ts">
  import { onMount } from "svelte";
  import type { ChartGridV1 } from "@topostack/data-contracts/chart-bathymetry";
  import * as THREE from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import { chartSurface } from "./chart-surface";

  let { grid, onUnavailable }: { grid: ChartGridV1; onUnavailable: () => void } = $props();
  let host: HTMLDivElement;
  let exaggeration = $state(5);
  let reset = () => {};
  let zoom: (factor: number) => void = () => {};
  let rotate = () => {};
  let updateScale: (value: number) => void = () => {};
  $effect(() => { updateScale(exaggeration); });

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
      scene.add(mesh, new THREE.HemisphereLight(0xffffff, 0x506080, 2));
      const light = new THREE.DirectionalLight(0xffffff, 2);
      light.position.set(-2, 5, 3); scene.add(light);
      const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
      const controls = new OrbitControls(camera, renderer.domElement);
      resources.push(() => controls.dispose());
      controls.maxPolarAngle = Math.PI / 2;
      controls.minDistance = 0.2;
      const render = () => renderer.render(scene, camera);
      controls.addEventListener("change", render);
      reset = () => {
        const depth = data.deepest * data.scale * exaggeration;
        controls.target.set(0, -depth / 2, 0);
        const distance = Math.max(3.5, (2 + depth) / Math.min(camera.aspect, 1));
        camera.position.set(0, distance * 0.8 - depth / 2, distance);
        camera.far = Math.max(1000, distance * 10); camera.updateProjectionMatrix();
        controls.update(); render();
      };
      zoom = (factor) => { camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target); controls.update(); };
      rotate = () => { camera.position.sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 6).add(controls.target); controls.update(); };
      updateScale = (value) => { mesh.scale.y = value; render(); };
      updateScale(exaggeration);
      const resize = () => {
        const { width, height } = host.getBoundingClientRect();
        if (!width || !height) return;
        renderer.setSize(width, height);
        camera.aspect = width / height; camera.updateProjectionMatrix(); render();
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

<div class="depth-3d" bind:this={host} role="img" aria-label="Generated lake bed in 3D. Depths extend below the water surface. Use the buttons below to rotate and zoom."></div>
<div class="depth-controls">
  <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" onclick={() => rotate()}>Rotate</button>
  <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" onclick={() => zoom(0.8)}>Zoom in</button>
  <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" onclick={() => zoom(1.25)}>Zoom out</button>
  <button class="ldt-button ldt-button--quiet ldt-button--sm" type="button" onclick={() => reset()}>Reset view</button>
  <label>Vertical exaggeration
    <select class="ldt-input" bind:value={exaggeration} aria-label="Vertical exaggeration">
      <option value={1}>1× · true scale</option><option value={5}>5×</option><option value={10}>10×</option><option value={20}>20×</option>
    </select>
  </label>
</div>
<p class="chart-hint">Drag to rotate · scroll or pinch to zoom. Reset faces north. Exaggeration changes only this preview.</p>

<style>
  .depth-3d { width: 100%; height: clamp(240px, 42vh, 480px); background: var(--loidolt-surface-alt); border-radius: var(--loidolt-border-radius); overflow: hidden; }
  .depth-3d :global(canvas) { display: block; touch-action: none; }
  .depth-controls { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; }
  select { width: auto; min-width: 8rem; }
  label { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
</style>
