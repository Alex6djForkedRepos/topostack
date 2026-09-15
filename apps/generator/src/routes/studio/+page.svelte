<script lang="ts">
  import { onMount } from "svelte";
  import { DEFAULT_PROJECT, generateGeometry, type GeometryIRV1 } from "@topostack/core";
  import { createSamplePreviewSource } from "../../sample-preview";
  let App = $state.raw<typeof import("../../app/App.svelte").default>();
  import "../../app/styles.css";

  let preview = $state.raw<GeometryIRV1>();
  let error = $state(false);
  onMount(() => {
    let active = true;
    void import("../../app/App.svelte").then((module) => { if (active) App = module.default; }).catch(() => { if (active) error = true; });
    const source = createSamplePreviewSource();
    if (typeof Worker === "undefined") { preview = generateGeometry(DEFAULT_PROJECT, source); return () => { active = false; }; }
    const worker = new Worker(new URL("../../geometry.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ result?: GeometryIRV1; error?: string }>) => {
      worker.terminate();
      if (event.data.result) preview = event.data.result;
      else error = true;
    };
    worker.onerror = () => { worker.terminate(); error = true; };
    worker.postMessage({ id: 0, config: DEFAULT_PROJECT, source });
    return () => { active = false; worker.terminate(); };
  });
</script>

<svelte:head>
  <script async src="https://static-res.makextool.com/scripts/js/generator-sdk/platform-sdk.js"></script>
</svelte:head>

{#if preview && App}
  <App initialPreview={preview} />
{:else}
  <main class="startup" aria-busy={!error}>
    <h1>Build the landscape.</h1>
    <noscript><p>The terrain studio needs JavaScript to generate and preview your map. <a href="https://topostack.echofoxtrot.works/guides/laser-cut-topographic-map">Read the layered map guide</a>.</p></noscript>
    {#if error}<p role="alert">The preview could not load. Reload to try again.</p><button onclick={() => location.reload()}>Reload</button>
    {:else}<p role="status">Preparing your terrain preview…</p>{/if}
  </main>
{/if}

<style>
  .startup { min-height: 100dvh; display: grid; place-content: center; gap: 1rem; text-align: center; background: var(--loidolt-background, #161814); color: var(--loidolt-foreground, #e7e9e3); }
  h1, p { margin: 0; }
</style>
