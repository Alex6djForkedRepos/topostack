<script lang="ts">
  import { onMount } from "svelte";
  import { Button, Field, IconButton, Input, Select } from "@loidolt/theme-svelte";
  import { Upload } from "@lucide/svelte";
  import { decodeChartDepths, type ChartAttestation, type ChartUnit, type UserChartBathymetryV1 } from "@topostack/data-contracts/chart-bathymetry";
  import type { ChartBuildResult, ChartImage } from "$lib/domain/chart-build";
  import { ChartTraceClient } from "$lib/workers/chart-trace-client";

  /**
   * Turns a depth chart the maker has — a scan, a photo, a screenshot — into a
   * lake bed for one lake. It asks for three things a picture cannot say: which
   * lake it is (already chosen before opening), what its numbers mean, and
   * which contour each number belongs to.
   *
   * Depths are typed, not read by machine. A recognizer reads loose labels
   * poorly and the ones printed along a contour worse, and a wrong depth is
   * worse than no depth: it carves a lake bed that looks right.
   */

  let { lake, onClose, onSave }: {
    lake: { hylakId: number; name: string; outline: [number, number][] };
    onClose: () => void;
    onSave: (record: UserChartBathymetryV1) => Promise<void>;
  } = $props();

  /** Charts are traced at most this wide or tall: enough detail, bounded memory. */
  const MAX_SIDE = 2400;
  const UNITS: { value: ChartUnit; label: string }[] = [
    { value: "ft", label: "Feet" },
    { value: "m", label: "Metres" },
    { value: "fathom", label: "Fathoms" },
  ];
  const ATTESTATIONS: { value: ChartAttestation; label: string }[] = [
    { value: "own-work", label: "I made this chart myself" },
    { value: "public-domain", label: "It is in the public domain" },
    { value: "open-license", label: "Its licence allows reuse" },
    { value: "personal-use", label: "Someone else's chart, for my own use only" },
  ];

  interface PlacedLabel { x: number; y: number; value: number }

  let dialog: HTMLDialogElement;
  let canvas = $state<HTMLCanvasElement | undefined>();
  let previewCanvas = $state<HTMLCanvasElement | undefined>();
  let stage = $state<"image" | "labels" | "result">("image");
  let image = $state.raw<ChartImage | undefined>();
  let bitmap = $state.raw<ImageBitmap | undefined>();
  /** The decoded page, kept as ImageData so redrawing the canvas costs nothing. */
  let pixels = $state.raw<ImageData | undefined>();
  let title = $state("");
  let fileSha256 = $state("");
  let units = $state<ChartUnit>("ft");
  let reads = $state<"depth" | "elevation">("depth");
  let surface = $state("0");
  let interval = $state("5");
  let attestation = $state<ChartAttestation>("own-work");
  let labels = $state.raw<PlacedLabel[]>([]);
  // A number input hands back a number once it parses, and the raw text while it does not.
  let pendingDepth = $state<string | number>("");
  let busy = $state(false);
  let error = $state("");
  let result = $state.raw<ChartBuildResult | undefined>();
  let saving = $state(false);

  const client = new ChartTraceClient();
  const ready = $derived(labels.length >= 2);

  onMount(() => {
    title = `${lake.name} depth chart`;
    dialog.showModal();
    return () => { client.dispose(); bitmap?.close(); if (dialog.open) dialog.close(); };
  });

  function closeFromBackdrop(event: MouseEvent): void {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }

  async function digestOf(file: File): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  /** Decodes the upload to RGBA, shrinking anything larger than MAX_SIDE. */
  async function readImage(file: File): Promise<ChartImage> {
    const source = await createImageBitmap(file);
    bitmap?.close();
    const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const surfaceCanvas = document.createElement("canvas");
    surfaceCanvas.width = width;
    surfaceCanvas.height = height;
    const context = surfaceCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot read image pixels.");
    context.drawImage(source, 0, 0, width, height);
    bitmap = source;
    pixels = context.getImageData(0, 0, width, height);
    return { width, height, data: pixels.data };
  }

  async function chooseFile(file: File | undefined): Promise<void> {
    if (!file) return;
    error = "";
    busy = true;
    try {
      const [decoded, digest] = await Promise.all([readImage(file), digestOf(file)]);
      image = decoded;
      fileSha256 = digest;
      labels = [];
      result = undefined;
      stage = "labels";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "This file could not be read as an image.";
    } finally {
      busy = false;
    }
  }

  /** Draws the chart with every placed depth marked on it. */
  function paint(): void {
    const context = canvas?.getContext("2d");
    if (!context || !canvas || !image) return;
    if (pixels) context.putImageData(pixels, 0, 0);
    context.lineWidth = Math.max(2, image.width / 400);
    context.font = `${Math.max(12, Math.round(image.width / 40))}px sans-serif`;
    context.textBaseline = "middle";
    for (const label of labels) {
      const radius = Math.max(6, image.width / 120);
      context.strokeStyle = "#b3261e";
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(label.x, label.y, radius, 0, 2 * Math.PI);
      context.fill();
      context.stroke();
      context.fillStyle = "#b3261e";
      context.fillText(String(label.value), label.x + radius * 1.4, label.y);
    }
  }

  $effect(() => {
    if (stage === "labels" && image && canvas) { void labels; paint(); }
  });

  $effect(() => {
    if (stage === "result" && result && previewCanvas) paintPreview(previewCanvas);
  });

  function addLabel(event: MouseEvent): void {
    if (!canvas || !image) return;
    // An empty box is not a depth of zero: it means no depth was typed yet.
    const typed = String(pendingDepth).trim();
    const depth = typed === "" ? Number.NaN : Number(typed);
    if (!Number.isFinite(depth)) { error = "Type the depth printed on the contour, then click that contour."; return; }
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * image.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * image.height;
    labels = [...labels, { x, y, value: depth }];
    error = "";
  }

  function removeLabel(index: number): void {
    labels = labels.filter((_, at) => at !== index);
  }

  /** A placed depth as the tracer sees it: a glyph-sized word sitting on its line. */
  function wordsFor(): { text: string; left: number; top: number; right: number; bottom: number; angle: number; length: number; height: number }[] {
    const side = Math.min(24, Math.max(8, Math.round(Math.min(image!.width, image!.height) / 80)));
    return labels.map((label) => ({
      text: String(label.value),
      left: label.x - side / 2, right: label.x + side / 2,
      top: label.y - side / 2, bottom: label.y + side / 2,
      angle: 0, length: side, height: side,
    }));
  }

  async function trace(): Promise<void> {
    if (!image || !ready) return;
    busy = true;
    error = "";
    try {
      result = await client.build({
        image,
        lake: { name: lake.name, hylakId: lake.hylakId, outline: lake.outline },
        units,
        labels: reads,
        ...(reads === "elevation" ? { surface: Number(surface) || 0 } : {}),
        interval: Number(interval) || undefined,
        words: wordsFor(),
        resolutionM: 20,
        title: title.trim() || `${lake.name} depth chart`,
        attestation,
        fileSha256,
        tool: "chart-trace",
      });
      stage = "result";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "This chart could not be traced.";
    } finally {
      busy = false;
    }
  }

  /** The finished lake bed, shallow to deep, so the shape can be checked at a glance. */
  function paintPreview(node: HTMLCanvasElement): void {
    const record = result?.record;
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

  async function save(): Promise<void> {
    if (!result) return;
    saving = true;
    error = "";
    try {
      await onSave(result.record);
      dialog.close();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : "This chart could not be saved in this browser.";
    } finally {
      saving = false;
    }
  }
</script>

<dialog bind:this={dialog} class="ldt-dialog ldt-dialog--lg depth-chart-dialog" aria-labelledby="depth-chart-title" aria-describedby="depth-chart-description" onclose={onClose} onmousedown={closeFromBackdrop}>
  <header class="ldt-dialog__header">
    <div>
      <h2 id="depth-chart-title" class="ldt-dialog__title">Trace a depth chart</h2>
      <p id="depth-chart-description" class="ldt-dialog__description">Turn a printed depth chart of {lake.name} into its lake bed. The chart stays in this browser.</p>
    </div>
    <IconButton label="Close dialog" onclick={() => dialog.close()}>×</IconButton>
  </header>
  <div class="ldt-dialog__body">
    {#if error}<p class="depth-chart-error" role="alert">{error}</p>{/if}

    {#if stage === "image"}
      <p class="depth-chart-step">Choose a picture of the chart: a scan, a photo or a screenshot. Straight-on works best.</p>
      <label class="depth-chart-upload">
        <Upload size={18} />
        <span>Choose a chart image</span>
        <input type="file" accept="image/png,image/jpeg,image/webp" onchange={(event) => { const input = event.currentTarget; void chooseFile(input.files?.[0]).finally(() => { input.value = ""; }); }} />
      </label>
      {#if busy}<p role="status">Reading the image…</p>{/if}
    {/if}

    {#if stage === "labels" && image}
      <p class="depth-chart-step">Type a depth, then click the contour it is printed on. <strong>Two or more depths are needed</strong>: one alone cannot say which way the lake gets deeper.</p>
      <div class="depth-chart-settings">
        <Field label="Depths are in">{#snippet children({ id })}<Select {id} bind:value={units} options={UNITS} />{/snippet}</Field>
        <Field label="The chart prints">{#snippet children({ id })}<Select {id} bind:value={reads} options={[{ value: "depth", label: "Depth below the surface" }, { value: "elevation", label: "Height above a datum" }]} />{/snippet}</Field>
        {#if reads === "elevation"}
          <Field label="Surface level">{#snippet children({ id })}<Input {id} type="number" bind:value={surface} boxed />{/snippet}</Field>
        {/if}
        <Field label="Contour interval">{#snippet children({ id })}<Input {id} type="number" min="0" step="0.5" bind:value={interval} boxed />{/snippet}</Field>
      </div>
      <div class="depth-chart-place">
        <Field label="Depth to place">{#snippet children({ id })}<Input {id} type="number" value={String(pendingDepth)} placeholder="e.g. 10" boxed oninput={(event) => { pendingDepth = event.currentTarget.value; }} />{/snippet}</Field>
        <p class="depth-chart-hint" role="status">{labels.length === 0 ? "Click the contour this depth belongs to." : `${labels.length} placed${ready ? "" : " · one more needed"}`}</p>
      </div>
      <canvas bind:this={canvas} width={image.width} height={image.height} class="depth-chart-canvas" onclick={addLabel} aria-label={`${lake.name} depth chart, ${labels.length} depths placed`}></canvas>
      {#if labels.length}
        <ul class="depth-chart-labels">
          {#each labels as label, index (index)}
            <li><span>{label.value} {units === "m" ? "m" : units === "ft" ? "ft" : "fathoms"}</span><button type="button" onclick={() => removeLabel(index)}>Remove</button></li>
          {/each}
        </ul>
      {/if}
      <div class="depth-chart-actions">
        <Button onclick={() => { stage = "image"; }}>Choose another image</Button>
        <Button variant="primary" disabled={!ready || busy} onclick={() => void trace()}>{busy ? "Tracing…" : "Trace this chart"}</Button>
      </div>
    {/if}

    {#if stage === "result" && result}
      <p class="depth-chart-step">This is the lake bed the chart gives. Check the shape before saving.</p>
      <div class="depth-chart-result">
        <canvas bind:this={previewCanvas} class="depth-chart-preview"></canvas>
        <dl class="depth-chart-report">
          <div><dt>Deepest</dt><dd>{result.report.deepestM.toFixed(1)} m</dd></div>
          <div><dt>Contours levelled</dt><dd>{Math.round(result.report.coverage * 100)}%</dd></div>
          <div><dt>Fit to the lake's shape</dt><dd>{Math.round(result.report.iou * 100)}%</dd></div>
        </dl>
      </div>
      {#if result.report.snapUncertain}
        <p class="depth-chart-warning" role="alert">The chart's shape does not match this lake closely. Check the preview against the lake before saving, or try a straighter picture.</p>
      {/if}
      {#if result.report.coverage < 1}
        <p class="depth-chart-warning" role="status">Some contours carry no depth. Going back and placing another depth usually fixes the rest.</p>
      {/if}
      <div class="depth-chart-settings">
        <Field label="Chart name">{#snippet children({ id })}<Input {id} bind:value={title} boxed />{/snippet}</Field>
        <Field label="Where this chart came from">{#snippet children({ id })}<Select {id} bind:value={attestation} options={ATTESTATIONS} />{/snippet}</Field>
      </div>
      <p class="depth-chart-hint">{attestation === "personal-use" ? "Kept on this device and in your project files only." : "Kept on this device; you may choose to share it later."}</p>
      <div class="depth-chart-actions">
        <Button onclick={() => { stage = "labels"; }}>Back to depths</Button>
        <Button variant="primary" disabled={saving} onclick={() => void save()}>{saving ? "Saving…" : "Use this depth chart"}</Button>
      </div>
    {/if}
  </div>
</dialog>
