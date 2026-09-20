<script lang="ts">
  import { onMount } from "svelte";
  import { DEFAULT_PROJECT, generateGeometry, type GeometryIRV1 } from "@topostack/core";
  import { createSamplePreviewSource } from "$lib/domain/sample-preview";
  import type { GeometryWorkerReady, GeometryWorkerRequest, GeometryWorkerResponse } from "$lib/workers/geometry-worker-client";
  let App = $state.raw<typeof import("$lib/studio/App.svelte").default>();
  import "$lib/studio/styles.css";

  let preview = $state.raw<GeometryIRV1>();
  let error = $state(false);
  onMount(() => {
    let active = true;
    void import("$lib/studio/App.svelte").then((module) => { if (active) App = module.default; }).catch(() => { if (active) error = true; });
    const source = createSamplePreviewSource();
    let worker: Worker | undefined;
    const stopWorker = () => { if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); worker = undefined; } };
    // Workers can be missing, blocked by CSP inside a host frame, or fail to
    // load; the sample preview is small enough to finish on the main thread.
    const generateHere = () => {
      stopWorker();
      if (!active) return;
      try { preview = generateGeometry(DEFAULT_PROJECT, source); }
      catch { error = true; }
    };
    if (typeof Worker === "undefined") { generateHere(); return () => { active = false; }; }
    try { worker = new Worker(new URL("../../lib/workers/geometry.worker.ts", import.meta.url), { type: "module" }); }
    catch { generateHere(); return () => { active = false; }; }
    worker.onmessage = (event: MessageEvent<GeometryWorkerResponse | GeometryWorkerReady>) => {
      if (event.data.ready) return;
      if (event.data.result) { stopWorker(); if (active) preview = event.data.result; }
      else generateHere();
    };
    worker.onerror = (event) => { event.preventDefault(); generateHere(); };
    // An unreadable reply never reaches onmessage; without this the startup screen would wait forever.
    worker.onmessageerror = () => generateHere();
    const request: GeometryWorkerRequest = { id: 0, config: DEFAULT_PROJECT, sourceId: 0, source };
    try { worker.postMessage(request); }
    catch { generateHere(); }
    return () => { active = false; stopWorker(); };
  });
</script>

<svelte:head>
  {#if import.meta.env.VITE_SITE_ENV !== "atomm"}<script async src="https://static-res.makextool.com/scripts/js/generator-sdk/platform-sdk.js"></script>{/if}
</svelte:head>

{#if preview && App}
  <App initialPreview={preview} />
{:else}
  <main class="startup" aria-busy={!error}>
    <h1>Build the landscape.</h1>
    <noscript><p>The terrain studio needs JavaScript to generate and preview your map. <a href="https://topostack.app/guides/laser-cut-topographic-map">Read the layered map guide</a>.</p></noscript>
    {#if error}<p role="alert">The preview could not load. Reload to try again.</p><button onclick={() => location.reload()}>Reload</button>
    {:else}<p role="status">Preparing your terrain preview…</p>{/if}
  </main>
{/if}

<style>
  .startup { min-height: 100dvh; display: grid; place-content: center; gap: 1rem; text-align: center; background: var(--loidolt-background, #161814); color: var(--loidolt-foreground, #e7e9e3); }
  h1, p { margin: 0; }
</style>
