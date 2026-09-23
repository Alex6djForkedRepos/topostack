import type { ChartContour } from "$lib/domain/chart-contours";
import { CHART_BATHYMETRY_LIMITS, decodeChartDepths, type ChartAttestation, type ChartUnit, type UserChartBathymetryV1 } from "@topostack/data-contracts/chart-bathymetry";
import type { ChartImage } from "$lib/domain/chart-build";
import type { UserDepthChartRefV1 } from "@topostack/core";
import { ChartTraceClient } from "$lib/workers/chart-trace-client";
import { draft, draftRevision, resetChartImage } from "$lib/studio/customdata/chart-draft.svelte";

/**
 * Tracing one depth chart: reading the picture, placing the depths printed on
 * it, and asking the worker for the lake bed they give.
 *
 * The controls sit in the sidebar and the chart being clicked fills the
 * viewport, so neither component can own this. It lives here with the draft,
 * which means it also survives the view being left and reopened.
 *
 * Depths are typed by the maker, not read by machine. A recognizer reads
 * labels set into contour lines poorly, and a wrong depth is worse than no
 * depth: it carves a lake bed that looks right.
 */

/** Charts are traced at most this wide or tall: enough detail, bounded memory. */
const MAX_SIDE = 2400;

export const CHART_UNITS: { value: ChartUnit; label: string }[] = [
  { value: "ft", label: "Feet" },
  { value: "m", label: "Metres" },
  { value: "fathom", label: "Fathoms" },
];
export const CHART_READS = [
  { value: "depth", label: "Depth below the surface" },
  { value: "elevation", label: "Height above a datum" },
];
export const CHART_ATTESTATIONS: { value: ChartAttestation; label: string }[] = [
  { value: "own-work", label: "I made this chart myself" },
  { value: "public-domain", label: "It is in the public domain" },
  { value: "open-license", label: "Its licence allows reuse" },
  { value: "personal-use", label: "Someone else's chart, for my own use only" },
];

/** The name typed for the chart, within the record's limit, or one made from the lake's. */
function chartTitle(): string {
  return draft.title.trim().slice(0, CHART_BATHYMETRY_LIMITS.title) || `${draft.lake?.name ?? "Lake"} depth chart`;
}

/** What is happening to the draft right now, as opposed to what it holds. */
export interface PendingChartPoint { x: number; y: number; reach: number; index?: number }
export const MIN_CHART_DEPTH_POINTS = 3;
export const session = $state({ pendingDepth: "" as string | number, point: undefined as PendingChartPoint | undefined, busy: false, keeping: false, error: "" });

/** The guided flow needs three confirmed samples before tracing. */
export function traceHint(): string {
  if (session.point) return "Confirm or cancel the selected point before tracing.";
  if (draft.depths.length < MIN_CHART_DEPTH_POINTS) return `Confirm at least ${MIN_CHART_DEPTH_POINTS} points on different contour lines to trace the lake bed.`;
  if (draft.reads === "elevation" && !Number.isFinite(typedNumber(draft.surface))) return "Enter the water surface elevation in the same units as the chart.";
  if (String(draft.interval).trim() && (!Number.isFinite(typedNumber(draft.interval)) || typedNumber(draft.interval) <= 0)) return "Enter a positive contour interval, or leave it blank to infer it from your depths.";
  return "";
}

export function canTrace(): boolean {
  return !traceHint();
}

export function unitLabel(unit: ChartUnit): string {
  return unit === "m" ? "m" : unit === "ft" ? "ft" : "fathoms";
}

let client: ChartTraceClient | undefined;
let operation = 0;

/** Frees the trace worker. The custom data view calls this as it closes. */
export function disposeTracer(): void {
  client?.dispose();
  client = undefined;
}

async function digestOf(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A decoded page as the engine reads it, and as the canvas redraws it. */
function asChartImage(pixels: ImageData): { image: ChartImage; pixels: ImageData } {
  return { image: { width: pixels.width, height: pixels.height, data: pixels.data }, pixels };
}

const isPdf = (file: File): boolean => file.type === "application/pdf" || /\.pdf$/i.test(file.name);

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

/**
 * Reads a chart upload: a picture, or one page of a PDF drawn as a picture.
 * The PDF reader is loaded only when a PDF is chosen.
 */
export async function chooseChartFile(file: File | undefined, page = 1): Promise<void> {
  if (!file) return;
  const mine = ++operation;
  const revision = draftRevision();
  const current = () => mine === operation && revision === draftRevision();
  disposeTracer();
  cancelDepthPoint();
  session.error = "";
  session.busy = true;
  try {
    const pdf = isPdf(file);
    const [read, digest] = await Promise.all([
      pdf ? import("$lib/domain/chart-pdf").then(async ({ renderPdfPage }) => renderPdfPage(new Uint8Array(await file.arrayBuffer()), page, MAX_SIDE)) : readImage(file),
      digestOf(file),
    ]);
    if (!current()) return;
    if ("blank" in read && read.blank) {
      // The chart may be on another page: offer the pages, not a blank picture.
      resetChartImage();
      draft.pdf = { file, pages: read.pages, page: read.page };
      draft.imageName = file.name;
      session.error = `Page ${read.page} of this PDF is blank here. Choose the page the chart is on; if every page is blank, save the chart as a PNG or JPEG instead.`;
      return;
    }
    const { image, pixels } = "pages" in read ? asChartImage(read.pixels) : read;
    resetChartImage();
    draft.image = image;
    draft.pixels = pixels;
    draft.imageName = "pages" in read && read.pages > 1 ? `${file.name}, page ${read.page}` : file.name;
    draft.pdf = "pages" in read ? { file, pages: read.pages, page: read.page } : undefined;
    draft.fileSha256 = digest;
    draft.title ||= `${draft.lake?.name ?? "Lake"} depth chart`;
  } catch (cause) {
    if (current()) session.error = cause instanceof Error ? cause.message : "This file could not be read as an image.";
  } finally {
    if (mine === operation) session.busy = false;
  }
}

/** Draws the chart with every placed depth marked on it, and the keyboard crosshair when it has one. */
export function paintChart(canvas: HTMLCanvasElement, crosshair?: { x: number; y: number }, contour?: ChartContour): void {
  const context = canvas.getContext("2d");
  const image = draft.image;
  if (!context || !image) return;
  if (draft.pixels) context.putImageData(draft.pixels, 0, 0);
  if (contour?.points.length) {
    const scale = image.width / (canvas.getBoundingClientRect().width || image.width);
    const accent = getComputedStyle(canvas).getPropertyValue("--loidolt-accent").trim() || "#c4511b";
    for (const [colour, width] of [["#ffffff", 7], [accent, 3]] as const) {
      context.strokeStyle = colour;
      context.lineWidth = width * scale;
      context.beginPath();
      contour.points.forEach(([x, y], i) => { if (i === 0) context.moveTo(x, y); else context.lineTo(x, y); });
      if (contour.closed) context.closePath();
      context.stroke();
    }
  }
  context.lineWidth = Math.max(2, image.width / 400);
  context.font = `${Math.max(12, Math.round(image.width / 40))}px sans-serif`;
  context.textBaseline = "middle";
  const radius = Math.max(6, image.width / 120);
  for (const [index, depth] of draft.depths.entries()) {
    context.strokeStyle = "#b3261e";
    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(depth.x, depth.y, radius, 0, 2 * Math.PI);
    context.fill();
    context.stroke();
    context.fillStyle = "#b3261e";
    context.fillText(`${index + 1} · ${depth.value}`, depth.x + radius * 1.4, depth.y);
  }
  if (crosshair) {
    // Drawn twice, light under dark, so it shows on ink and on paper alike.
    const arm = radius * 3;
    for (const [colour, width] of [["#ffffff", context.lineWidth * 2.5], ["#1d4ed8", context.lineWidth]] as const) {
      context.strokeStyle = colour;
      context.lineWidth = width;
      context.beginPath();
      context.moveTo(crosshair.x - arm, crosshair.y); context.lineTo(crosshair.x + arm, crosshair.y);
      context.moveTo(crosshair.x, crosshair.y - arm); context.lineTo(crosshair.x, crosshair.y + arm);
      context.stroke();
    }
  }
}

/** The finished lake bed, shallow to deep, so its shape can be checked at a glance. */
export function paintDepthPreview(canvas: HTMLCanvasElement): void {
  const record = draft.result?.record;
  const context = canvas.getContext("2d");
  if (!record || !context) return;
  const depths = decodeChartDepths(record.grid);
  const { width, height } = record.grid;
  canvas.width = width;
  canvas.height = height;
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

/**
 * Records the typed depth at a point of the chart, in image pixels. `reach` is
 * how far off the line the click may be, also in image pixels; the canvas
 * works it out from a fixed distance on screen, however large the chart.
 */
export function placeDepth(x: number, y: number, reach: number): void {
  if (!draft.image) return;
  // An empty box is not a depth of zero: it means no depth was typed yet.
  const typed = String(session.pendingDepth).trim();
  const value = typed === "" ? Number.NaN : Number(typed);
  if (!Number.isFinite(value) || (draft.reads === "depth" && value < 0)) {
    session.error = "Type the depth printed on the contour, then click that contour.";
    return;
  }
  draft.depths = [...draft.depths, { x, y, value, reach }];
  session.error = "";
}

/** Select first, then ask for the value beside that location. Clicking an existing point edits it. */
export function selectDepthPoint(x: number, y: number, reach: number): void {
  if (!draft.image || session.busy || session.keeping) return;
  const index = draft.depths.findIndex((point) => Math.hypot(point.x - x, point.y - y) <= reach);
  if (index >= 0) { editDepthPoint(index); return; }
  session.point = { x, y, reach };
  session.pendingDepth = "";
  session.error = "";
}

export function editDepthPoint(index: number): void {
  const point = draft.depths[index];
  if (!point || session.busy || session.keeping) return;
  session.point = { x: point.x, y: point.y, reach: point.reach, index };
  session.pendingDepth = String(point.value);
  session.error = "";
}

export function cancelDepthPoint(): void {
  session.point = undefined;
  session.pendingDepth = "";
  session.error = "";
}

export function confirmDepthPoint(): boolean {
  const point = session.point;
  if (!point || session.busy || session.keeping) return false;
  const value = String(session.pendingDepth).trim() === "" ? Number.NaN : Number(session.pendingDepth);
  if (!Number.isFinite(value) || (draft.reads === "depth" && value < 0)) {
    session.error = draft.reads === "depth" ? "Enter a depth of zero or more." : "Enter the elevation printed on this contour.";
    return false;
  }
  const confirmed = { x: point.x, y: point.y, reach: point.reach, value };
  if (point.index === undefined) draft.depths = [...draft.depths, confirmed];
  else draft.depths = draft.depths.map((depth, index) => index === point.index ? confirmed : depth);
  cancelDepthPoint();
  return true;
}

export function removeDepth(index: number): void {
  if (session.busy || session.keeping) return;
  cancelDepthPoint();
  draft.depths = draft.depths.filter((_, at) => at !== index);
}

/**
 * Everything a trace is made from. A result traced from other inputs is out of
 * date: it must not be kept, and a trace that finishes after the inputs moved
 * on must not land on the new draft.
 */
export function traceInputsKey(): string {
  return JSON.stringify([draft.lake?.id, draft.fileSha256, draft.pdf?.page ?? 0, draft.placement, draft.depths.map(({ x, y, value }) => [x, y, value]), draft.units, draft.reads, draft.reads === "elevation" ? draft.surface : "", draft.interval]);
}

/** Whether the traced result still matches what is on screen. */
export function resultIsCurrent(): boolean {
  return draft.result !== undefined && draft.resultKey === traceInputsKey();
}

const typedNumber = (text: string): number => (String(text).trim() === "" ? Number.NaN : Number(text));

export async function traceChart(): Promise<void> {
  const image = draft.image;
  const lake = draft.lake;
  if (!image || !lake || !canTrace() || session.busy) return;
  const mine = ++operation;
  const revision = draftRevision();
  session.busy = true;
  session.error = "";
  client ??= new ChartTraceClient();
  const key = traceInputsKey();
  try {
    const result = await client.build({
      // The draft is reactive state, and a worker cannot clone its proxies:
      // everything crossing the wire is copied out plainly first.
      image: { width: image.width, height: image.height, data: image.data },
      lake: { name: lake.name, ...(lake.hylakId === undefined ? {} : { hylakId: lake.hylakId }), outline: lake.outline.map(([lon, lat]) => [lon, lat] as [number, number]) },
      units: draft.units,
      labels: draft.reads,
      ...(draft.reads === "elevation" ? { surface: typedNumber(draft.surface) } : {}),
      interval: typedNumber(draft.interval) > 0 ? typedNumber(draft.interval) : undefined,
      marks: draft.depths.map(({ x, y, value, reach }) => ({ x, y, value, reach })),
      resolutionM: 20,
      title: chartTitle(),
      attestation: draft.attestation,
      fileSha256: draft.fileSha256,
      tool: "chart-trace",
      placement: draft.placement,
    });
    // The maker may have placed a depth or changed a setting while this ran.
    if (mine !== operation || revision !== draftRevision() || key !== traceInputsKey()) return;
    draft.result = result;
    draft.resultKey = key;
  } catch (cause) {
    // Leaving the view cancels a trace; that is not something that went wrong.
    if (cause instanceof DOMException && cause.name === "AbortError") return;
    if (mine === operation && revision === draftRevision() && key === traceInputsKey()) session.error = cause instanceof Error ? cause.message : "This chart could not be traced.";
  } finally {
    if (mine === operation) session.busy = false;
  }
}

/**
 * Hands the traced record to the library. Saving is the studio's job, so the
 * caller passes it in and this module stays free of the studio context.
 */
export async function keepChart(save: (record: UserChartBathymetryV1) => Promise<UserDepthChartRefV1>): Promise<boolean> {
  const traced = draft.result?.record;
  if (!traced || !resultIsCurrent() || session.keeping) return false;
  session.keeping = true;
  session.error = "";
  // The name and where the chart came from are asked for after the trace, so
  // they are applied here rather than baked in when it was traced.
  const record: UserChartBathymetryV1 = {
    ...traced,
    provenance: { ...traced.provenance, title: chartTitle() },
    license: { ...traced.license, attestation: draft.attestation },
  };
  try {
    await save(record);
    return true;
  } catch (cause) {
    session.error = cause instanceof Error ? cause.message : "This chart could not be saved in this browser.";
    return false;
  } finally {
    session.keeping = false;
  }
}

/**
 * Traces again with the chart laid on the lake the next plausible way. A lake
 * that looks the same turned half round fits both ways, and only the maker,
 * comparing the lake bed with the chart, can say which is right.
 */
export async function tryNextPlacement(): Promise<void> {
  const report = draft.result?.report;
  if (!report || report.placements < 2) return;
  draft.placement = (report.placement + 1) % report.placements;
  await traceChart();
}

export function resetSession(): void {
  operation += 1;
  disposeTracer();
  session.point = undefined;
  session.pendingDepth = "";
  session.busy = false;
  session.keeping = false;
  session.error = "";
}
