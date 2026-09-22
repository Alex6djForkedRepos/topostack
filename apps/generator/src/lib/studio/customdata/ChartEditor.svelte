<script lang="ts">
  import { onDestroy } from "svelte";
  import { Button, Field, Input, Select } from "@loidolt/theme-svelte";
  import { Upload } from "@lucide/svelte";
  import { decodeChartDepths, type ChartAttestation, type ChartUnit, type UserChartBathymetryV1 } from "@topostack/data-contracts/chart-bathymetry";
  import type { ChartImage } from "$lib/domain/chart-build";
  import { ChartTraceClient } from "$lib/workers/chart-trace-client";
  import { draft, resetChartImage } from "$lib/studio/customdata/chart-draft.svelte";

  /**
   * Tracing one depth chart: the picture, the depths printed on it, and the
   * lake bed they give. Everything it works on lives in the shared draft, so
   * leaving this view and coming back does not lose a half-traced chart.
   *
   * Depths are typed by the maker, not read by machine. A recognizer reads
   * labels set into contour lines poorly, and a wrong depth is worse than no
   * depth: it carves a lake bed that looks right.
   */

  let { onKeep }: { onKeep: (record: UserChartBathymetryV1) => Promise<void> } = $props();

  /** Charts are traced at most this wide or tall: enough detail, bounded memory. */
  const MAX_SIDE = 2400;
  const UNITS: { value: ChartUnit; label: string }[] = [
    { value: "ft", label: "Feet" },
    { value: "m", label: "Metres" },
    { value: "fathom", label: "Fathoms" },
  ];
  const READS = [
    { value: "depth", label: "Depth below the surface" },
    { value: "elevation", label: "Height above a datum" },
  ];
  const ATTESTATIONS: { value: ChartAttestation; label: string }[] = [
    { value: "own-work", label: "I made this chart myself" },
    { value: "public-domain", label: "It is in the public domain" },
    { value: "open-license", label: "Its licence allows reuse" },
    { value: "personal-use", label: "Someone else's chart, for my own use only" },
  ];

  let canvas = $state<HTMLCanvasElement | undefined>();
  let previewCanvas = $state<HTMLCanvasElement | undefined>();
  let pendingDepth = $state<string | number>("");
  let busy = $state(false);
  let keeping = $state(false);
  let error = $state("");

  const client = new ChartTraceClient();
  const ready = $derived(draft.depths.length >= 2);
  onDestroy(() => client.dispose());

  async function digestOf(file: File): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  /** Decodes the upload to RGBA, shrinking anything larger than MAX_SIDE. */
  async function readImage(file: File): Promise<{ image: ChartImage; pixels: ImageData }> {
    const source = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
      const width = Math.max(1, Math.round(source.width * scale));
      const height = Math.max(1, Math.round(source.height * scale));
      const page = document.createElement("canvas");
      page.width = width;
      page.height = height;
      const context = page.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("This browser cannot read image pixels.");
      context.drawImage(source, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      return { image: { width, height, data: pixels.data }, pixels };
    } finally {
      source.close();
    }
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file) return;
    error = "";
    busy = true;
    try {
      const [{ image, pixels }, digest] = await Promise.all([readImage(file), digestOf(file)]);
      resetChartImage();
      draft.image = image;
      draft.pixels = pixels;
      draft.imageName = file.name;
      draft.fileSha256 = digest;
      draft.title ||= `${draft.lake?.name ?? "Lake"} depth chart`;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "This file could not be read as an image.";
    } finally {
      busy = false;
    }
  }

  /** Draws the chart with every placed depth marked on it. */
  function paint(): void {
    const context = canvas?.getContext("2d");
    const image = draft.image;
    if (!context || !image) return;
    if (draft.pixels) context.putImageData(draft.pixels, 0, 0);
    context.lineWidth = Math.max(2, image.width / 400);
    context.font = `${Math.max(12, Math.round(image.width / 40))}px sans-serif`;
    context.textBaseline = "middle";
    const radius = Math.max(6, image.width / 120);
    for (const depth of draft.depths) {
      context.strokeStyle = "#b3261e";
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(depth.x, depth.y, radius, 0, 2 * Math.PI);
      context.fill();
      context.stroke();
      context.fillStyle = "#b3261e";
      context.fillText(String(depth.value), depth.x + radius * 1.4, depth.y);
    }
  }

  $effect(() => {
    if (draft.image && canvas) { void draft.depths; paint(); }
  });

  $effect(() => {
    if (draft.result && previewCanvas) paintPreview(previewCanvas);
  });

  function addDepth(event: MouseEvent): void {
    const image = draft.image;
    if (!canvas || !image) return;
    // An empty box is not a depth of zero: it means no depth was typed yet.
    const typed = String(pendingDepth).trim();
    const value = typed === "" ? Number.NaN : Number(typed);
    if (!Number.isFinite(value)) { error = "Type the depth printed on the contour, then click that contour."; return; }
    const bounds = canvas.getBoundingClientRect();
    draft.depths = [...draft.depths, {
      x: ((event.clientX - bounds.left) / bounds.width) * image.width,
      y: ((event.clientY - bounds.top) / bounds.height) * image.height,
      value,
    }];
    draft.result = undefined;
    error = "";
  }

  function removeDepth(index: number): void {
    draft.depths = draft.depths.filter((_, at) => at !== index);
    draft.result = undefined;
  }

  /** A placed depth as the tracer sees it: a glyph-sized word sitting on its line. */
  function wordsFor(image: ChartImage) {
    const side = Math.min(24, Math.max(8, Math.round(Math.min(image.width, image.height) / 80)));
    return draft.depths.map((depth) => ({
      text: String(depth.value),
      left: depth.x - side / 2, right: depth.x + side / 2,
      top: depth.y - side / 2, bottom: depth.y + side / 2,
      angle: 0, length: side, height: side,
    }));
  }

  async function trace(): Promise<void> {
    const image = draft.image;
    const lake = draft.lake;
    if (!image || !lake || !ready) return;
    busy = true;
    error = "";
    try {
      draft.result = await client.build({
        // The draft is reactive state, and a worker cannot clone its proxies:
        // everything crossing the wire is copied out plainly first.
        image: { width: image.width, height: image.height, data: image.data },
        lake: { name: lake.name, hylakId: lake.hylakId, outline: lake.outline.map(([lon, lat]) => [lon, lat] as [number, number]) },
        units: draft.units,
        labels: draft.reads,
        ...(draft.reads === "elevation" ? { surface: Number(draft.surface) || 0 } : {}),
        interval: Number(draft.interval) || undefined,
        words: wordsFor(image),
        resolutionM: 20,
        title: draft.title.trim() || `${lake.name} depth chart`,
        attestation: draft.attestation,
        fileSha256: draft.fileSha256,
        tool: "chart-trace",
      });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "This chart could not be traced.";
    } finally {
      busy = false;
    }
  }

  /** The finished lake bed, shallow to deep, so its shape can be checked at a glance. */
  function paintPreview(node: HTMLCanvasElement): void {
    const record = draft.result?.record;
    const context = node.getContext("2d");
    if (!record || !context) return;
    const depths = decodeChartDepths(record.grid);
    const { width, height } = record.grid;
    node.width = width;
    node.height = height;
    const pixels = context.createImageData(width, height);
    let deepest = 0;
    for (const depth of depths) if (!Number.isNaN(depth)) deepest = Math.max(deepest, depth);
    for (let index = 0; index < depths.length; index += 1) {
      const depth = depths[index]!;
      const at = index * 4;
      if (Number.isNaN(depth)) { pixels.data[at + 3] = 0; continue; }
      const share = deepest ? depth / deepest : 0;
      pixels.data[at] = Math.round(222 * (1 - share) + 8 * share);
      pixels.data[at + 1] = Math.round(238 * (1 - share) + 46 * share);
      pixels.data[at + 2] = Math.round(255 * (1 - share) + 122 * share);
      pixels.data[at + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
  }

  async function keep(): Promise<void> {
    if (!draft.result) return;
    keeping = true;
    error = "";
    try {
      await onKeep(draft.result.record);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "This chart could not be saved in this browser.";
    } finally {
      keeping = false;
    }
  }
</script>

<section class="chart-editor" aria-label="Trace a depth chart">
  {#if error}<p class="chart-error" role="alert">{error}</p>{/if}

  {#if !draft.image}
    <p class="chart-step">Choose a picture of the chart: a scan, a photo or a screenshot. Straight-on works best.</p>
    <label class="chart-upload">
      <Upload size={18} />
      <span>{busy ? "Reading the image…" : "Choose a chart image"}</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" onchange={(event) => { const input = event.currentTarget; void chooseFile(input.files?.[0]).finally(() => { input.value = ""; }); }} />
    </label>
  {:else}
    <div class="chart-settings">
      <Field label="Depths are in">{#snippet children({ id })}<Select {id} bind:value={draft.units} options={UNITS} />{/snippet}</Field>
      <Field label="The chart prints">{#snippet children({ id })}<Select {id} bind:value={draft.reads} options={READS} />{/snippet}</Field>
      {#if draft.reads === "elevation"}
        <Field label="Surface level">{#snippet children({ id })}<Input {id} type="number" bind:value={draft.surface} boxed />{/snippet}</Field>
      {/if}
      <Field label="Contour interval">{#snippet children({ id })}<Input {id} type="number" min="0" step="0.5" bind:value={draft.interval} boxed />{/snippet}</Field>
    </div>

    <div class="chart-place">
      <Field label="Depth to place">{#snippet children({ id })}<Input {id} type="number" value={String(pendingDepth)} placeholder="e.g. 10" boxed oninput={(event) => { pendingDepth = event.currentTarget.value; }} />{/snippet}</Field>
      <p class="chart-hint" role="status">
        {#if draft.depths.length === 0}Type a depth, then click the contour it is printed on.
        {:else if !ready}1 placed · one more needed, because a single depth cannot say which way the lake deepens.
        {:else}{draft.depths.length} placed.
        {/if}
      </p>
    </div>

    <canvas bind:this={canvas} width={draft.image.width} height={draft.image.height} class="chart-canvas" onclick={addDepth} aria-label={`${draft.lake?.name ?? "Chart"}, ${draft.depths.length} depths placed`}></canvas>

    {#if draft.depths.length}
      <ul class="chart-depths">
        {#each draft.depths as depth, index (index)}
          <li><span>{depth.value} {draft.units === "m" ? "m" : draft.units === "ft" ? "ft" : "fathoms"}</span><button type="button" onclick={() => removeDepth(index)}>Remove</button></li>
        {/each}
      </ul>
    {/if}

    <div class="chart-actions">
      <Button onclick={resetChartImage}>Choose another image</Button>
      <Button variant="primary" disabled={!ready || busy} onclick={() => void trace()}>{busy ? "Tracing…" : draft.result ? "Trace again" : "Trace this chart"}</Button>
    </div>

    {#if draft.result}
      <div class="chart-result">
        <canvas bind:this={previewCanvas} class="chart-preview"></canvas>
        <dl class="chart-report">
          <div><dt>Deepest</dt><dd>{draft.result.report.deepestM.toFixed(1)} m</dd></div>
          <div><dt>Contours levelled</dt><dd>{Math.round(draft.result.report.coverage * 100)}%</dd></div>
          <div><dt>Fit to the lake's shape</dt><dd>{Math.round(draft.result.report.iou * 100)}%</dd></div>
        </dl>
      </div>
      {#if draft.result.report.snapUncertain}
        <p class="chart-warning" role="alert">The chart's shape does not match this lake closely. Check the preview against the lake, or try a straighter picture.</p>
      {/if}
      {#if draft.result.report.coverage < 1}
        <p class="chart-warning" role="status">Some contours carry no depth. Placing another depth usually fixes the rest.</p>
      {/if}
      <div class="chart-settings">
        <Field label="Chart name">{#snippet children({ id })}<Input {id} bind:value={draft.title} boxed />{/snippet}</Field>
        <Field label="Where this chart came from">{#snippet children({ id })}<Select {id} bind:value={draft.attestation} options={ATTESTATIONS} />{/snippet}</Field>
      </div>
      <div class="chart-actions">
        <p class="chart-hint">Kept in this browser. Nothing is carved until you use it for a lake.</p>
        <Button variant="primary" disabled={keeping} onclick={() => void keep()}>{keeping ? "Keeping…" : "Keep this chart"}</Button>
      </div>
    {/if}
  {/if}
</section>
