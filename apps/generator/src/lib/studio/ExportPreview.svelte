<script lang="ts">
  import { buildProjectPackage, exportBlockReason, type GeometryIRV1, type ProjectConfigV1 } from "@topostack/core";
  import { loadGuideFonts } from "$lib/studio/export-policy";
  import SvgViewport from "$lib/studio/SvgViewport.svelte";

  /**
   * What leaves the generator: the artwork Open in Studio sends, drawn from
   * the exported file itself, and the files a download holds.
   */
  let { geometry, project, busy = false }: { geometry: GeometryIRV1; project: ProjectConfigV1; busy?: boolean } = $props();

  type Built = { url: string; filename: string; bytes: number; width: number; height: number; cut: boolean; score: boolean; fill: boolean; files: Array<{ filename: string; bytes: number }> };
  let built = $state.raw<Built | undefined>();
  let failure = $state("");
  const blocked = $derived(exportBlockReason(geometry, project));

  function formatBytes(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  // The shown artwork's object URL, released when a newer build replaces it or the view closes.
  let shownUrl: string | undefined;
  function show(next: Built | undefined): void {
    if (shownUrl && shownUrl !== next?.url) URL.revokeObjectURL(shownUrl);
    shownUrl = next?.url;
    built = next;
  }
  $effect(() => () => show(undefined));

  $effect(() => {
    // Packaging serializes every sheet, so it waits for a settled preview and
    // yields a frame first; a newer edit cancels it before it starts. The last
    // artwork stays up while the preview refreshes.
    if (busy) return;
    if (blocked) { show(undefined); failure = ""; return; }
    const current = { geometry, project };
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const guideFonts = await loadGuideFonts();
          if (cancelled) return;
          const output = buildProjectPackage(current.geometry, current.project, { guideFonts });
          const svg = await output.master.blob.text();
          if (cancelled) return;
          // The image fills the file's own viewBox size, so the sheet keeps its proportions.
          const [, , width = current.geometry.widthMm, height = current.geometry.heightMm] = (/viewBox="([^"]+)"/.exec(svg)?.[1] ?? "").split(/\s+/).map(Number);
          // Real line widths (0.1 mm and up) rasterize to faint dots at fit zoom,
          // so the on-screen copy draws every line as a hairline. The file itself is unchanged.
          const display = svg.replace(/<svg\b[^>]*>/, (open) => `${open}<style>*{vector-effect:non-scaling-stroke;stroke-width:1px}</style>`);
          show({ url: URL.createObjectURL(new Blob([display], { type: "image/svg+xml" })), filename: output.master.filename, bytes: output.master.blob.size, width, height,
            cut: /stroke="#FE0002"/i.test(svg), score: /stroke="#2366FF"/i.test(svg), fill: /fill="#2366FF"/i.test(svg), files: output.files.map((file) => ({ filename: file.filename, bytes: file.blob.size })) });
          failure = "";
        } catch (error) {
          if (!cancelled) { show(undefined); failure = error instanceof Error ? error.message : "The export preview could not be prepared."; }
        }
      })();
    }, 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  });

  const totalBytes = $derived(built?.files.reduce((total, file) => total + file.bytes, 0) ?? 0);
</script>

<div class="export-preview">
  {#if built}
    <div class="export-sheet">
      <SvgViewport widthMm={built.width} heightMm={built.height} topLeft label="export" svgLabel={`Export preview of ${built.filename}`} controlsLabel="Export preview zoom controls" resetLabel="Reset export view">
        <rect x="0" y="0" width={built.width} height={built.height} fill="#fff" />
        <image href={built.url} x="0" y="0" width={built.width} height={built.height} />
      </SvgViewport>
    </div>
    <section class="export-manifest" aria-label="Export contents">
      <h2>Export contents</h2>
      <p class="export-manifest-row"><span>Open in Studio</span><strong title={built.filename}>{built.filename}</strong><small>{formatBytes(built.bytes)}</small></p>
      <details>
        <summary><span>Download</span><strong>{built.files.length} files</strong><small>{formatBytes(totalBytes)}</small></summary>
        <ul>{#each built.files as file (file.filename)}<li><span title={file.filename}>{file.filename}</span><small>{formatBytes(file.bytes)}</small></li>{/each}</ul>
      </details>
      <div class="export-key">{#if built.cut}<span><i class="export-key-cut" aria-hidden="true"></i>Red line · Cut</span>{/if}{#if built.score}<span><i class="export-key-score" aria-hidden="true"></i>Blue line · Score</span>{/if}{#if built.fill}<span><i class="export-key-fill" aria-hidden="true"></i>Blue fill · Engrave</span>{/if}</div>
    </section>
  {:else}
    <p class="export-preview-state" role="status">{failure || blocked || (busy ? "The export preview appears once the terrain is ready." : "Preparing export preview…")}</p>
  {/if}
</div>
