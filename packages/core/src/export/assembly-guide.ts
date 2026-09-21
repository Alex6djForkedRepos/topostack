import { escapeXml } from "./svg-primitives.js";
import { formatNumber as format } from "../primitives/format.js";
import { pointInPolygon, ringBounds } from "../primitives/geometry2d.js";
import { displayElevation, displayLength, elevationUnit, lengthUnit } from "../primitives/units.js";
import { PAINT_BLEED_MM } from "../pipeline/paint-regions.js";
import type { GeometryIRV1, LayerIR, PaintRegionKind, Point2D, Polygon2D, ProjectConfigV1 } from "../types.js";

/** One exported sheet, as the guide refers to it: the file to cut and what it holds. */
export interface GuideSheet {
  filename: string;
  layerIndexes: number[];
  cellName?: string;
  /** Polygon indexes per layer on this sheet; absent when the project is cut whole. */
  included?: Map<number, Set<number>>;
  /** Paint templates actually written for this sheet. */
  paintTemplates?: Array<{ kind: PaintRegionKind; filename: string }>;
}

// The printed diagram is about 7.5 in wide, so detail finer than a few hundred
// segments across the model is invisible and only bloats the file.
const DIAGRAM_RESOLUTION = 900;
const ACCENT = "#d9642b";

/** Douglas-Peucker thinning of a closed ring; the result stays closed. */
function simplifyRing(ring: Point2D[], tolerance: number): Point2D[] {
  const open = ring.length > 1 && ring[0]!.x === ring.at(-1)!.x && ring[0]!.y === ring.at(-1)!.y ? ring.slice(0, -1) : ring;
  if (open.length <= 4) return ring;
  const keep = new Uint8Array(open.length);
  keep[0] = 1;
  keep[open.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, open.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const a = open[start]!;
    const b = open[end]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    let farthest = -1;
    let distance = tolerance;
    for (let index = start + 1; index < end; index += 1) {
      const point = open[index]!;
      const d = length ? Math.abs(dy * point.x - dx * point.y + b.x * a.y - b.y * a.x) / length : Math.hypot(point.x - a.x, point.y - a.y);
      if (d > distance) {
        distance = d;
        farthest = index;
      }
    }
    if (farthest >= 0) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  const kept = open.filter((_, index) => keep[index]);
  return kept.length >= 3 ? [...kept, kept[0]!] : ring;
}

function ringPath(ring: Point2D[]): string {
  const round = (value: number) => Number(value.toFixed(1)).toString();
  return `M${ring.slice(0, -1).map((point) => `${round(point.x)} ${round(point.y)}`).join("L")}Z`;
}

function polygonPath(polygon: Polygon2D, tolerance: number): string {
  return [polygon.outer, ...polygon.holes]
    .filter((ring) => {
      const bounds = ringBounds(ring);
      return Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) > tolerance * 2;
    })
    .map((ring) => ringPath(simplifyRing(ring, tolerance))).join("");
}

/** A point inside the piece near its bounding-box centre, for a label or a callout. */
function labelPoint(polygon: Polygon2D): Point2D {
  const bounds = ringBounds(polygon.outer);
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  if (pointInPolygon(centre, polygon)) return centre;
  let best: Point2D | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  const steps = 9;
  for (let row = 0; row <= steps; row += 1) {
    for (let column = 0; column <= steps; column += 1) {
      const point = { x: bounds.minX + (bounds.maxX - bounds.minX) * column / steps, y: bounds.minY + (bounds.maxY - bounds.minY) * row / steps };
      const distance = Math.hypot(point.x - centre.x, point.y - centre.y);
      if (distance < bestDistance && pointInPolygon(point, polygon)) {
        best = point;
        bestDistance = distance;
      }
    }
  }
  return best ?? polygon.outer[0] ?? centre;
}

/** Stack tones from pale at the base to a deeper stone at the summit. */
function tone(index: number, count: number): string {
  const t = count > 1 ? index / (count - 1) : 0;
  const mix = (from: number, to: number) => Math.round(from + (to - from) * t);
  return `rgb(${mix(236, 158)} ${mix(231, 146)} ${mix(221, 126)})`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function layerNumber(layer: LayerIR): string {
  return layer.id.replace("layer-", "");
}

/**
 * A printable (US Letter), step-by-step assembly booklet: a cover with the finished
 * dimensions, a cutting checklist, how to read the engraved marks, and one
 * illustrated step per layer showing the stack so far with the new layer
 * highlighted. Self-contained HTML - it opens in any browser and prints from
 * there - and each layer's outline is written once and reused by every step
 * through `<use>`, so the file grows with the layer count rather than its square.
 */
export function assemblyGuideToHtml(ir: GeometryIRV1, config: ProjectConfigV1, sheets: GuideSheet[]): string {
  const units = config.units;
  const unit = lengthUnit(units);
  const length = (valueMm: number) => `${format(Number(displayLength(valueMm, units).toFixed(units === "imperial" ? 2 : 1)))} ${unit}`;
  const elevation = (valueM: number) => `${Math.round(displayElevation(valueM, units)).toLocaleString("en-US")} ${elevationUnit(units)}`;
  const layers = ir.layers;
  const count = layers.length;
  const thickness = layers[0]?.materialThicknessMm ?? config.materialThicknessMm;
  const tolerance = Math.max(ir.widthMm, ir.heightMm) / DIAGRAM_RESOLUTION;
  const pad = Math.max(ir.widthMm, ir.heightMm) * 0.03;
  const viewBox = `${format(-ir.widthMm / 2 - pad)} ${format(-ir.heightMm / 2 - pad)} ${format(ir.widthMm + pad * 2)} ${format(ir.heightMm + pad * 2)}`;
  const pieceTotal = layers.reduce((total, layer) => total + (layer.pieces.length || layer.polygons.length), 0);
  const split = ir.splitPlan;
  const nests = ir.fabricationNests;
  const labelsOn = Boolean(split) && config.showAssemblyLabels;
  // Painting is driven by the templates actually written, not the setting:
  // a project with no visible water writes none, and the guide must not ask for them.
  const templates = sheets.flatMap((sheet) => (sheet.paintTemplates ?? []).map((template) => ({ ...template, sheet })));
  const painted = templates.length > 0;
  const paintKinds = [...new Set(templates.map((template) => template.kind))];
  const paintWhat = paintKinds.join(" and ");
  /** Templates holding a stencil for one of this layer's pieces, grouped by kind. */
  const templatesFor = (layerIndex: number) => paintKinds.flatMap((kind) => {
    const polygons = new Set((ir.paintRegions ?? []).filter((region) => region.kind === kind && region.layerIndex === layerIndex).map((region) => region.polygonIndex));
    const files = templates.filter((template) => template.kind === kind && template.sheet.layerIndexes.includes(layerIndex)
      && [...polygons].some((polygon) => !template.sheet.included || template.sheet.included.get(layerIndex)?.has(polygon)));
    return files.length ? [{ kind, files }] : [];
  });

  const sheetsByLayer = new Map<number, GuideSheet[]>();
  for (const sheet of sheets) for (const index of sheet.layerIndexes) sheetsByLayer.set(index, [...(sheetsByLayer.get(index) ?? []), sheet]);
  const donorsOf = (index: number) => [...new Set(nests.filter((nest) => nest.nestedLayerIndex === index).map((nest) => nest.donorLayerIndex))];
  const nestedIn = (index: number) => [...new Set(nests.filter((nest) => nest.donorLayerIndex === index).map((nest) => nest.nestedLayerIndex))];

  const defs = layers.map((layer) => `<path id="g-${layer.id}" d="${layer.polygons.map((polygon) => polygonPath(polygon, tolerance)).join("")}"/>`).join("");
  const stack = (upTo: number) => layers.slice(0, upTo).map((layer, index) => `<use href="#g-${layer.id}" fill="${tone(index, count)}"/>`).join("");
  const diagram = (body: string, label: string) => `<svg class="diagram" viewBox="${viewBox}" role="img" aria-label="${escapeXml(label)}">${body}</svg>`;

  const stepFigure = (layer: LayerIR): string => {
    const small = Math.max(ir.widthMm, ir.heightMm) * 0.06;
    const callouts = layer.polygons.map((polygon, polygonIndex) => {
      const bounds = ringBounds(polygon.outer);
      const point = labelPoint(polygon);
      const piece = layer.pieces.find((entry) => entry.polygonIndex === polygonIndex);
      const text = labelsOn && piece ? `<text x="${format(point.x)}" y="${format(point.y)}" class="piece-id">${escapeXml(piece.id.replace(/^L\d+-/, ""))}</text>` : "";
      const ring = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) < small ? `<circle cx="${format(point.x)}" cy="${format(point.y)}" r="${format(small * 0.7)}" class="callout"/>` : "";
      return ring + text;
    }).join("");
    return diagram(`${stack(layer.index)}<use href="#g-${layer.id}" class="current"/>${callouts}`, `Stack after adding layer ${layerNumber(layer)}`);
  };

  const steps = layers.map((layer, index) => {
    const number = layerNumber(layer);
    const pieces = layer.pieces.length || layer.polygons.length;
    const below = layers[index - 1];
    const layerSheets = sheetsByLayer.get(index) ?? [];
    const donors = donorsOf(index).map((donor) => layers[donor]).filter((entry): entry is LayerIR => Boolean(entry));
    const hasSmall = layer.polygons.some((polygon) => {
      const bounds = ringBounds(polygon.outer);
      return Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) < Math.max(ir.widthMm, ir.heightMm) * 0.06;
    });
    const find = `Find the ${pieces === 1 ? "piece" : `${pieces} pieces`} of layer ${number}${layerSheets.length ? `, cut from ${layerSheets.map((sheet) => `<code>${escapeXml(sheet.filename)}</code>`).join(", ")}` : ""}.`;
    const nestedNote = donors.length ? ` ${pieces === 1 ? "It was" : "They were"} cut from inside layer ${donors.map(layerNumber).join(" and ")} to save material, so look among that sheet's cutouts.` : "";
    const smallNote = hasSmall ? " Small pieces are circled in the picture." : "";
    const items = [`${find}${nestedNote}${smallNote}`];
    for (const { kind, files } of templatesFor(index)) {
      items.push(`Paint the ${kind} first if you have not already: ${files.map(({ filename }) => `<code>${escapeXml(filename)}</code>`).join(", ")} ${files.length === 1 ? "is its template" : "are its templates"}. Let it dry before gluing.`);
    }
    if (split && pieces > 1) {
      items.push(`${labelsOn ? "Match the letter-number id engraved on each piece to the picture and b" : "B"}utt the pieces together${config.seamTabs && index < count - 1 ? "; the jigsaw tabs only fit their true neighbour, so press them home before gluing" : ""}.`);
    }
    if (index === 0) {
      items.push("Lay it on a flat board, engraved side up. This is the base; every other layer stacks on top of it.");
      if (nestedIn(0).length) items.push("Keep the small cutouts that fall out of it: they are pieces of higher layers.");
    } else {
      items.push("Spread a thin layer of glue on the underside, staying a little way in from the edges so squeeze-out stays hidden.");
      items.push(config.showAlignmentGuides && below
        ? `Set it down on layer ${layerNumber(below)} so its edges sit on the engraved outline there, then press it flat.`
        : "Line its edges up with the terrain below as shown in the picture, then press it flat.");
    }
    if (index === count - 1) items.push("This is the top layer. Wipe off any squeeze-out now, before it cures.");
    const meta = [`${elevation(layer.elevationM)} and up`, plural(pieces, "piece")].join(" · ");
    return `<article class="step" id="step-${index + 1}">
<header><span class="badge">${index + 1}</span><div><p class="kicker">Step ${index + 1} of ${count}</p><h3>Layer ${number}</h3><p class="meta">${meta}</p></div><label class="done"><input type="checkbox"> Done</label></header>
<figure>${stepFigure(layer)}</figure>
<ol>${items.map((item) => `<li>${item}</li>`).join("")}</ol>
</article>`;
  }).join("\n");

  const sheetRows = sheets.map((sheet) => {
    const ids = sheet.layerIndexes.map((index) => layers[index]).filter((entry): entry is LayerIR => Boolean(entry)).map(layerNumber);
    return `<tr><td><input type="checkbox" aria-label="Cut ${escapeXml(sheet.filename)}"></td><td><code>${escapeXml(sheet.filename)}</code></td><td>${ids.join(", ")}${sheet.cellName ? ` <span class="muted">· cell ${escapeXml(sheet.cellName)}</span>` : ""}</td></tr>`;
  }).join("");

  const templateRows = templates.map(({ filename, sheet }) => `<tr><td><input type="checkbox" aria-label="Cut ${escapeXml(filename)}"></td><td><code>${escapeXml(filename)}</code></td><td>for <code>${escapeXml(sheet.filename)}</code></td></tr>`).join("");
  const paintSection = painted ? `<section class="page">
<h2>3. Paint before you glue</h2>
<p class="muted">${plural(templates.length, "sheet has", "sheets have")} a paper template for painting the ${paintWhat} that stays visible. Painted pieces are much harder to reach once the stack is built, so do this first.</p>
<ol>
<li>Cut each template from paper or stencil film <strong>with kerf compensation turned off</strong>: it is the piece at its nominal size, with the ${paintWhat} cut away as windows.</li>
<li>Lay the template flush on its cut piece and line it up on the piece edges and tabs it keeps. Where the ${paintWhat} reaches the piece edge the template stops short of it.</li>
<li>Spray, lift the template off, and let the paint dry.</li>
<li>The windows reach ${length(PAINT_BLEED_MM)} under the layer above so no bare edge shows. That strip is glued, so wipe or lightly sand a thick paint film there to keep the next layer flat.</li>
</ol>
<table><tbody>${templateRows}</tbody></table>
</section>` : "";

  const marks = [
    config.showAlignmentGuides ? `<li><strong>Outline and Lxx label.</strong> Each layer carries an engraved outline showing exactly where the next layer sits, plus its layer number. Both end up hidden under the layer above.</li>` : "",
    labelsOn ? `<li><strong>Piece ids.</strong> Each layer is cut in ${split!.columns} × ${split!.rows} parts. Every piece has a green id like <code>L03-B2</code> (layer 03, column B, row 2) where the next layer will cover it. Top-layer pieces have none; use the step picture.</li>` : "",
    split && !labelsOn ? `<li><strong>Split layers.</strong> Each layer is cut in ${split.columns} × ${split.rows} parts. Use the step pictures to place them.</li>` : "",
    `<li><strong>Everything else</strong> engraved on the pieces (contours, roads, labels) is part of the artwork.</li>`,
  ].filter(Boolean).join("");

  const width = length(ir.widthMm);
  const height = length(ir.heightMm);
  const facts = [
    ["Finished size", `${width} × ${height} × ${length(count * thickness)}`],
    ["Layers", `${count} × ${length(thickness)}`],
    ["Pieces", String(pieceTotal)],
    ["Sheets to cut", String(sheets.length)],
    ["Elevation", `${elevation(ir.minElevationM)} – ${elevation(ir.maxElevationM)}`],
    ["Vertical exaggeration", `${ir.verticalExaggeration.toFixed(1)}×`],
  ].map(([term, value]) => `<div><dt>${term}</dt><dd>${value}</dd></div>`).join("");

  const title = `${escapeXml(ir.projectName)}: assembly guide`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root{--ink:#1d2622;--muted:#5d6a63;--line:#d8d2c6;--paper:#fbf8f2;--card:#fff;--accent:${ACCENT}}
*{box-sizing:border-box}
html{background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{margin:0;padding:24px 16px 64px}
main{max-width:8.5in;margin:0 auto}
h1,h2,h3{line-height:1.15;margin:0}
h1{font-size:2.4rem;letter-spacing:-.02em}
h2{font-size:1.5rem;margin-bottom:12px}
h3{font-size:1.35rem}
p{margin:0 0 10px}
code{font:.82em ui-monospace,SFMono-Regular,Menlo,monospace;background:#f1ece2;padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
.muted,.meta,.kicker{color:var(--muted)}
.kicker{text-transform:uppercase;letter-spacing:.08em;font-size:.75rem;font-weight:600;margin:0}
.page{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px;margin-bottom:20px}
.cover .diagram{margin:20px 0}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px 20px;margin:0}
.facts dt{font-size:.78rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
.facts dd{margin:0;font-weight:600;font-size:1.05rem}
.diagram{display:block;width:100%;height:auto;max-height:118mm}
.diagram use{stroke:#7d7566;stroke-width:.6;vector-effect:non-scaling-stroke;fill-rule:evenodd}
.diagram use.current{fill:var(--accent);stroke:#5a2710;stroke-width:1.4}
.diagram .callout{fill:none;stroke:var(--accent);stroke-width:1.6;stroke-dasharray:4 3;vector-effect:non-scaling-stroke}
.diagram .piece-id{font:700 ${format(Math.max(ir.widthMm, ir.heightMm) * 0.035)}px system-ui,sans-serif;fill:#fff;stroke:#5a2710;stroke-width:.35em;paint-order:stroke;text-anchor:middle;dominant-baseline:central}
.two{display:grid;grid-template-columns:1fr 1fr;gap:24px}
ul,ol{margin:0;padding-left:1.3em}
li{margin-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:.92rem}
td{border-top:1px solid var(--line);padding:6px 8px 6px 0;vertical-align:top}
td:first-child{width:28px}
input[type=checkbox]{width:18px;height:18px;accent-color:var(--accent);margin:0}
.step{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 24px;margin-bottom:20px;break-inside:avoid}
.step header{display:flex;gap:16px;align-items:center;margin-bottom:12px}
.step header>div{flex:1}
.badge{flex:none;width:52px;height:52px;border-radius:50%;background:var(--accent);color:#fff;font-weight:800;font-size:1.4rem;display:grid;place-items:center}
.done{display:flex;gap:6px;align-items:center;font-size:.9rem;color:var(--muted);white-space:nowrap}
figure{margin:0 0 14px;background:#f6f2ea;border-radius:10px;padding:10px}
.print{position:fixed;right:16px;bottom:16px;border:0;border-radius:999px;background:var(--ink);color:#fff;padding:10px 18px;font:600 .95rem system-ui,sans-serif;cursor:pointer}
footer{font-size:.8rem;color:var(--muted);margin-top:28px}
@media (max-width:640px){.two{grid-template-columns:1fr}.page,.step{padding:18px}h1{font-size:1.9rem}.badge{width:42px;height:42px;font-size:1.15rem}}
@page{size:letter;margin:.5in}
@media print{
html{background:#fff;font-size:10pt}
body{padding:0}
.print{display:none}
.page,.step{border:0;border-radius:0;padding:0;margin:0 0 .3in}
h2,h3{break-after:avoid}
tr{break-inside:avoid}
.cover{break-after:page}
.cover .diagram{max-height:5.5in}
.build{break-before:page}
.step{display:grid;grid-template-columns:1.3fr 1fr;gap:0 .25in;align-items:start;border-top:1px solid var(--line);padding-top:.15in;margin:0 0 .15in}
.step header{grid-column:1/-1;margin-bottom:.08in}
.step figure{margin:0;padding:.06in}
.diagram{max-height:3.1in}
.badge{width:.5in;height:.5in;font-size:1.2rem}
li{margin-bottom:3px}
figure,code,.badge,.diagram{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${defs}</defs></svg>
<main>
<section class="page cover">
<p class="kicker">Assembly guide</p>
<h1>${escapeXml(ir.projectName)}</h1>
<p class="muted">A layered relief in ${plural(count, "layer")}. Build it from the bottom up, one layer per step.</p>
${diagram(stack(count), "The finished relief seen from above")}
<dl class="facts">${facts}</dl>
</section>
<section class="page">
<h2>Before you start</h2>
<div class="two">
<div>
<h3 class="kicker">You will need</h3>
<ul>
<li>${plural(sheets.length, "sheet")} of ${length(thickness)} material${split ? ` that fit your ${length(config.workAreaWidthMm)} × ${length(config.workAreaHeightMm)} work area` : `, each at least ${width} × ${height}`}</li>
<li>Glue suited to the material (wood glue for plywood or MDF)</li>
<li>A flat board to build on and some weights or clamps</li>
<li>A small bag or tray per layer, and a pencil</li>
${painted ? `<li>Paper or stencil film for ${plural(templates.length, "paint template")}, and paint</li>` : ""}
</ul>
</div>
<div>
<h3 class="kicker">Tips</h3>
<ul>
<li>Do a test cut first to check power, speed, and kerf.</li>
<li>As each sheet finishes, bag its pieces by layer number. Pencil the number on the back of any piece without one.</li>
${nests.length ? `<li><strong>Keep every cutout.</strong> Some small pieces of higher layers are cut from inside lower layers' sheets.</li>` : ""}
<li>Dry-fit each layer before gluing it.</li>
</ul>
</div>
</div>
</section>
<section class="page">
<h2>1. Cut the sheets</h2>
<p class="muted">Tick each file off as it comes off the laser. The layers column says which pieces are on that sheet.</p>
<table><tbody>${sheetRows}</tbody></table>
</section>
<section class="page">
<h2>2. Know the marks</h2>
<ul>${marks}</ul>
</section>
${paintSection}
<section class="build">
<h2 style="margin:28px 0 16px">${painted ? "4" : "3"}. Build the stack</h2>
${steps}
</section>
<section class="page">
<h2>Finish</h2>
<ul>
<li>Leave the stack flat under even weight until the glue has fully cured.</li>
<li>Clean laser smoke marks off the edges with a damp cloth or fine sandpaper.</li>
<li>Frame or mount it as you like.</li>
</ul>
<footer>Terrain data is decorative, not survey or engineering data. Made with TopoStack.</footer>
</section>
</main>
<button class="print" type="button" onclick="window.print()">Print guide</button>
</body>
</html>
`;
}
