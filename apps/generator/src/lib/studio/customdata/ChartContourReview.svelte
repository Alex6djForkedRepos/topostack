<script lang="ts">
  import { draft } from "./chart-draft.svelte";
  import { exportReviewDraft, generateReviewedDepths, generationIssues, reviewSourceKey, session, unitLabel } from "./chart-tracing.svelte";
  import { joinReviewContours, reviewAlignment, reviewGeometryIssues, type ChartReview, type ReviewContour } from "$lib/domain/chart-review";
  import type { Point2 } from "@topostack/chart-trace/local-frame";

  let selected = $state("");
  let joinTarget = $state("");
  let drawing = $state<Point2[] | undefined>();
  let drawTarget = $state("");
  let aligning = $state(false);
  let cursor = $state<Point2>([0, 0]);
  let zoom = $state(1);
  let vertex = $state(0);
  let error = $state("");
  let history = $state<string[]>([]);
  let future = $state<string[]>([]);
  let svg = $state<SVGSVGElement>();
  let source = $state("");
  const current = $derived(draft.review?.contours.find(c => c.id === selected));
  const issues = $derived(generationIssues());
  const pathIssues = $derived(draft.review && draft.image ? reviewGeometryIssues(draft.review, { image: draft.image, units: draft.units, labels: draft.reads, surface: Number(draft.surface), interval: Number(draft.interval) }).filter(issue => issue.contourIds.length) : []);
  const stale = $derived(draft.reviewSourceKey !== reviewSourceKey());
  const locked = $derived(session.busy || session.keeping || stale);
  const alignment = $derived.by(() => {
    if (!draft.review || !draft.lake) return undefined;
    try { return reviewAlignment(draft.review, draft.lake.outline); } catch { return undefined; }
  });
  $effect(() => {
    if (!draft.pixels) return;
    const canvas = document.createElement("canvas");
    canvas.width = draft.pixels.width; canvas.height = draft.pixels.height;
    canvas.getContext("2d")?.putImageData(draft.pixels, 0, 0);
    source = canvas.toDataURL();
  });

  const clone = (): ChartReview => JSON.parse(JSON.stringify(draft.review));
  function edit(action: (review: ChartReview) => void): void {
    if (!draft.review || locked) return;
    const next = clone();
    try { action(next); } catch (cause) { error = cause instanceof Error ? cause.message : "Edit failed."; return; }
    history = [...history.slice(-39), JSON.stringify(draft.review)]; future = [];
    next.alignmentConfirmed = false;
    draft.review = next; draft.layersReviewedKey = ""; error = "";
  }
  function update(action: (contour: ReviewContour) => void): void { edit(r => { const c = r.contours.find(c => c.id === selected); if (c) action(c); }); }
  function undo(redo = false): void {
    const from = redo ? future : history;
    if (!from.length || locked) return;
    const before = JSON.stringify(draft.review);
    draft.review = JSON.parse(from.at(-1)!); draft.layersReviewedKey = "";
    if (redo) { future = future.slice(0, -1); history = [...history, before]; }
    else { history = history.slice(0, -1); future = [...future, before]; }
  }
  function path(points: Point2[], closed: boolean): string { return points.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ") + (closed ? " Z" : ""); }
  function position(event: MouseEvent): Point2 {
    const point = svg!.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(svg!.getScreenCTM()!.inverse());
    return [Math.max(0, Math.min(draft.image!.width, local.x)), Math.max(0, Math.min(draft.image!.height, local.y))];
  }
  function addPoint(point: Point2): void {
    cursor = point;
    if (locked) return;
    if (drawing) drawing = [...drawing, point];
    else if (aligning) {
      edit(r => r.controlPoints.push({ x: point[0], y: point[1], lon: Number.NaN, lat: Number.NaN }));
      aligning = false;
    }
  }
  function selectContour(event: MouseEvent | KeyboardEvent, id: string): void {
    if (drawing || aligning) return;
    event.stopPropagation(); selected = id; vertex = 0;
  }
  async function saveDraft(): Promise<void> {
    const file = exportReviewDraft();
    if (!file) return;
    const { startBrowserDownload } = await import("$lib/studio/native-export");
    startBrowserDownload({ filename: "contour-review.json", blob: new Blob([JSON.stringify(file)], { type: "application/json" }), fileCount: 1 });
  }
  function finishDrawing(): void {
    if (!drawing || drawing.length < 3) return;
    const points = drawing;
    edit(r => {
      const c = r.contours.find(c => c.id === drawTarget);
      if (c) { c.points = points; c.closed = true; c.confirmed = false; }
      else { const id = `manual-${crypto.randomUUID()}`; r.contours.push({ id, points, closed: true, value: null, confirmed: false, excluded: false }); selected = id; }
    });
    drawing = undefined; drawTarget = "";
  }
  function key(event: KeyboardEvent): void {
    if (event.key === "Escape") { drawing = undefined; aligning = false; return; }
    if (event.key === "Enter") { event.preventDefault(); addPoint(cursor); return; }
    const steps: Record<string, Point2> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const delta = steps[event.key];
    if (delta) { event.preventDefault(); cursor = [Math.max(0, Math.min(draft.image!.width, cursor[0] + delta[0] * (event.shiftKey ? 10 : 1))), Math.max(0, Math.min(draft.image!.height, cursor[1] + delta[1] * (event.shiftKey ? 10 : 1)))]; }
  }
</script>

{#if draft.review && draft.image}
<div class="review-editor" aria-label="Review and correct contours">
  <h3>5 · Review and correct contours</h3>
  <p>Compare every included path with the source. Select the shoreline, then assign and confirm each depth contour. This release supports complete closed contours without islands or underwater rises.</p>
  {#if stale}<p role="alert">Chart settings changed. Prepare contours again; these edits belong to the previous settings.</p>{/if}
  <div class="review-toolbar">
    <button disabled={locked} onclick={() => void saveDraft()}>Export review draft</button>
    <button disabled={locked || !history.length} onclick={() => undo()}>Undo edit</button>
    <button disabled={locked || !future.length} onclick={() => undo(true)}>Redo edit</button>
    <button disabled={locked} onclick={() => { drawing = []; drawTarget = ""; aligning = false; }}>Draw new contour</button>
    <label>Zoom <input aria-label="Chart review zoom" type="range" min="0.5" max="6" step="0.25" bind:value={zoom} /></label>
  </div>
  {#if drawing}
    <p role="status">Click vertices along the source line; finish to close it. Keyboard: arrows move the crosshair; Enter adds a vertex; Escape cancels.</p>
    <button disabled={drawing.length < 3 || locked} onclick={finishDrawing}>Finish closed path</button>
    <button onclick={() => { drawing = drawing?.slice(0, -1); }}>Undo drawn vertex</button>
    <button onclick={() => { drawing = undefined; }}>Cancel drawing</button>
  {/if}
  {#if aligning}<p role="status">Click a known coordinate on the source, then enter its longitude and latitude below. Arrow keys and Enter also place a point.</p>{/if}
  <!-- This composite editor supports arrow-key placement and Enter; its paths also have individual keyboard controls. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="review-source" role="application" aria-label="Source chart contour editor" tabindex="0" onclick={event => addPoint(position(event))} onkeydown={key}>
    <svg bind:this={svg} viewBox={`0 0 ${draft.image.width} ${draft.image.height}`} style:width={`${zoom * 100}%`} role="img" aria-label="Source with reviewed contour overlay">
      <image href={source} width={draft.image.width} height={draft.image.height} />
      {#each draft.review.contours as c (c.id)}
        {#if !c.excluded}
          <path d={path(c.points, c.closed)} fill="none" stroke={c.id === selected ? "#a21caf" : c.id === draft.review.shorelineId ? "#0284c7" : c.confirmed ? "#15803d" : "#d97706"} stroke-width={c.id === selected ? 4 : 2} vector-effect="non-scaling-stroke" role="button" tabindex="0" aria-label={`${c.id}, ${c.value ?? "unassigned"}, ${c.confirmed ? "confirmed" : "needs review"}`} onclick={event => selectContour(event, c.id)} onkeydown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectContour(event, c.id); } }} />
        {/if}
      {/each}
      {#if alignment}<path d={path(alignment.outlinePixels, true)} fill="none" stroke="#db2777" stroke-dasharray="8 5" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none" />{/if}
      {#if drawing}<path d={path(drawing, false)} fill="none" stroke="#a21caf" stroke-width="3" vector-effect="non-scaling-stroke" pointer-events="none" />{/if}
      {#each draft.review.controlPoints as point, index}
        <circle cx={point.x} cy={point.y} r="5" fill="#db2777" /><text x={point.x + 8} y={point.y} fill="#db2777" font-size="20">{index + 1}</text>
      {/each}
      {#if drawing || aligning}<path d={`M${cursor[0]-8},${cursor[1]}h16 M${cursor[0]},${cursor[1]-8}v16`} stroke="#1d4ed8" stroke-width="2" vector-effect="non-scaling-stroke" pointer-events="none" />{/if}
    </svg>
  </div>
  <p>Export a review draft before closing or reloading. Keep the original chart file to restore these edits later.</p>
  <p>Blue: shoreline · amber: needs review · green: confirmed · purple: selected · dashed pink: aligned map outline.</p>
  <label>Contour <select aria-label="Select review contour" value={selected} onchange={event => { selected = event.currentTarget.value; vertex = 0; }}>
    <option value="">Choose a path</option>
    {#each draft.review.contours as c}<option value={c.id}>{c.id} · {c.id === draft.review.shorelineId ? "shoreline" : c.value ?? "unassigned"} · {c.excluded ? "excluded" : c.confirmed ? "confirmed" : "review"}</option>{/each}
  </select></label>
  {#if current}
    <fieldset disabled={locked}>
      <legend>Selected path</legend>
      <label>Printed value ({unitLabel(draft.units)}) <input aria-label="Contour printed value" type="number" step="any" value={current.value ?? ""} oninput={event => update(c => { c.value = event.currentTarget.value === "" ? null : Number(event.currentTarget.value); c.confirmed = false; })} /></label>
      <button onclick={() => edit(r => { r.shorelineId = selected; const c = r.contours.find(c => c.id === selected)!; c.excluded = false; c.confirmed = false; })}>Use as shoreline</button>
      <button disabled={current.id !== draft.review.shorelineId && current.value === null} onclick={() => update(c => { c.confirmed = true; c.excluded = false; })}>Confirm path and value</button>
      <button onclick={() => update(c => { c.excluded = !c.excluded; c.confirmed = false; })}>{current.excluded ? "Restore path" : "Exclude stray path"}</button>
      <button disabled={current.closed} onclick={() => update(c => { c.closed = true; c.confirmed = false; })}>Close path</button>
      <button onclick={() => { drawTarget = selected; drawing = []; aligning = false; }}>Redraw selected path</button>
      <label>Join to <select bind:value={joinTarget}><option value="">Choose an open path</option>{#each draft.review.contours.filter(c => !c.closed && !c.excluded && c.id !== selected) as c}<option value={c.id}>{c.id}</option>{/each}</select></label>
      <button disabled={current.closed || !joinTarget} onclick={() => edit(r => { const a = r.contours.find(c => c.id === selected)!, b = r.contours.find(c => c.id === joinTarget)!; const joined = joinReviewContours(a, b); r.contours = r.contours.map(c => c.id === a.id ? joined : c.id === b.id ? { ...c, excluded: true, confirmed: false } : c); })}>Join paths</button>
      <details><summary>Correct individual vertices</summary>
        <label>Vertex <input type="number" min="1" max={current.points.length} value={vertex + 1} onchange={event => { vertex = Math.max(0, Math.min(current!.points.length - 1, Number(event.currentTarget.value) - 1)); }} /></label>
        {#if current.points[vertex]}
          {#each [0, 1] as axis}<label>{axis ? "Y" : "X"} <input type="number" step="any" value={current.points[vertex]![axis]} onchange={event => update(c => { c.points[vertex]![axis] = Number(event.currentTarget.value); c.confirmed = false; })} /></label>{/each}
          <button onclick={() => update(c => { const a = c.points[vertex]!, b = c.points[(vertex + 1) % c.points.length]!; c.points.splice(vertex + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); c.confirmed = false; })}>Insert midpoint after vertex</button>
          <button disabled={current.points.length <= 3} onclick={() => { update(c => { c.points.splice(vertex, 1); c.confirmed = false; }); vertex = 0; }}>Remove vertex</button>
        {/if}
      </details>
    </fieldset>
  {/if}
  <button disabled={locked} onclick={() => edit(r => { for (const c of r.contours) if (c.value === null && c.id !== r.shorelineId) c.excluded = true; })}>Exclude all unassigned paths</button>
  <p>Only exclude paths after checking they are text, borders, or other non-contour marks. Missing depth contours can distort the basin.</p>
  <h3>6 · Align with the lake</h3>
  <p>Add at least four known WGS84 coordinates spread around the source chart. Use printed coordinate ticks or identifiable mapped locations. A low fit error alone does not establish accuracy.</p>
  <button disabled={locked || draft.review.controlPoints.length >= 64} onclick={() => { aligning = true; drawing = undefined; }}>Place alignment point</button>
  {#each draft.review.controlPoints as point, index}
    <fieldset disabled={locked}>
      <legend>Alignment point {index + 1} · pixel {point.x.toFixed(1)}, {point.y.toFixed(1)}</legend>
      {#each ["lon", "lat"] as coordinate}
        <label>{coordinate === "lon" ? "Longitude" : "Latitude"}<input aria-label={`${coordinate === "lon" ? "Longitude" : "Latitude"} ${index + 1}`} type="number" step="any" value={Number.isFinite(point[coordinate as "lon" | "lat"]) ? point[coordinate as "lon" | "lat"] : ""} onchange={event => edit(r => { r.controlPoints[index]![coordinate as "lon" | "lat"] = event.currentTarget.value === "" ? Number.NaN : Number(event.currentTarget.value); })} /></label>
      {/each}
      <button onclick={() => edit(r => { r.controlPoints.splice(index, 1); })}>Remove alignment point {index + 1}</button>
    </fieldset>
  {/each}
  {#if alignment}<p>Alignment residual: {alignment.rmsM.toFixed(1)} m · shoreline overlap: {Math.round(alignment.iou * 100)}%. Check the dashed pink map outline against the blue source shoreline.</p>{/if}
  <label><input type="checkbox" disabled={locked || !alignment} checked={draft.review.alignmentConfirmed} onchange={event => { draft.review!.alignmentConfirmed = event.currentTarget.checked; draft.layersReviewedKey = ""; }} /> I checked the alignment and orientation against the source.</label>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if issues.length}<div role="status"><strong>Resolve before depth generation</strong><ul>{#each issues as issue}<li>{issue}</li>{/each}</ul></div>{/if}
  {#if pathIssues.length}<details><summary>Locate paths that need correction ({pathIssues.length})</summary><ul>{#each pathIssues as issue}<li>{issue.message} {#each [...new Set(issue.contourIds)] as id}<button onclick={() => { selected = id; vertex = 0; }}>{id}</button>{/each}</li>{/each}</ul></details>{/if}
  <button class="ldt-button ldt-button--primary" disabled={locked || issues.length > 0} onclick={() => void generateReviewedDepths()}>{session.busy ? "Generating depths…" : "Generate reviewed depths"}</button>
</div>
{/if}

<style>
  .review-editor { padding: 12px; min-width: 0; overflow: auto; }
  .review-editor p { font-size: 12px; line-height: 1.5; }
  .review-toolbar, fieldset { display: flex; gap: 8px; flex-wrap: wrap; margin-block: 10px; }
  .review-source { overflow: auto; max-height: 65vh; border: 1px solid var(--loidolt-border, #bbb); background: white; }
  svg { display: block; max-width: none; height: auto; }
  path[role="button"] { cursor: pointer; pointer-events: stroke; }
  path:focus { stroke: #a21caf; stroke-width: 5; outline: none; }
  label { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12px; }
  input[type="number"] { width: 110px; }
  select { max-width: 100%; }
  button, input, select { min-height: 32px; }
  button { padding: 5px 8px; }
  li { font-size: 12px; margin-block: 5px; }
</style>
