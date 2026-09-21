import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { filesBelow } from "../lib/files.mjs";

const dist = new URL("../../apps/generator/dist/", import.meta.url);
// Budget the lightweight homepage separately from the editor and its default
// 3D preview. Moving the editor must not hide its cost behind a smaller entry page.
// Production baseline measured with Node 24.18.0 and VITE_MAP_API_URL=https://ci.invalid:
// homepage 54.8 kB, startup 435.2 kB, all JS 874.9 kB, standalone CSS 32.8 kB.
// CI and .nvmrc build with Node 22.22.2; these numbers have not been re-measured
// there, so compare a Node 22.22.2 build before tightening or raising budgets.
// Includes terrain-informed lake depths, the interactive depth guide, and the
// integrated studio release. Keep roughly 2% JS headroom for platform/minifier
// variation; compare a fresh build before accepting future budget increases.
const budgets = {
  // Shared UI and search metadata are included in the homepage's preload graph.
  // Raised 2026-09-17 when the shared page registry gained the export-files and
  // troubleshooting guides: 55,9xx -> 56,141 with Node 22.14.0.
  // Raised again 2026-09-17 for the studio tour, map details, custom data and
  // settings reference guides: 56,141 -> 56,676 with Node 22.14.0.
  // Raised 2026-09-18 for the split-large-maps and water-paint-templates
  // guides: measured at 57,252 with Node 22.14.0.
  // Raised 2026-09-20 for article metadata: the shared page registry now also
  // carries each page's publication and modification dates and its sharing
  // card, which the layout's Seo component reads on client navigation.
  // Measured at 58,098 with Node 22.22.2.
  // Lowered 2026-09-21: head metadata now comes from the root layout's server
  // load, so the page registry left the homepage bundle and new pages no
  // longer cost homepage JavaScript. 57,942 -> 56,171 with Node 22.22.2 (production build).
  landingJavaScriptGzip: 57_200,
  landingHtmlGzip: 10_000,
  initialJavaScriptGzip: 180_000,
  // Includes the editor, default 3D preview, and geometry worker. Lake modeling
  // runs in the main-thread fallback as well as the worker, so both are counted.
  // Raised 2026-09-17 for the guides hub route and docs navigation layout
  // (every route entry counts here): 441,994 -> 444,688 with Node 22.14.0.
  // Raised again 2026-09-17 for the export-files and troubleshooting guide
  // routes: 446,818 -> 453,585 with Node 22.14.0.
  // Raised again 2026-09-17 for four more guide routes: 453,585 -> 464,010.
  // Raised 2026-09-18 for machine work-area splitting: the seam planner and the
  // per-cell panel writer are part of generateGeometry, which the studio route
  // imports directly for its first preview. Measured with Node 22.22.2 at
  // 463,134 startup and 914,639 total on the rebased branch.
  // Raised 2026-09-18 for merged paint stencils: the Clipper boolean and set
  // offset behind paintStencil ship in generateGeometry, and the cut-layer
  // overlay imports it for legacy IR. CI measured 474,123 with Node 22.22.2,
  // 123 bytes over the old line.
  // Raised 2026-09-20 for the Tier 1 studio features, measured with Node
  // 22.22.2 on dev (476,667) against all five branches merged (482,651), a
  // 5,984 byte delta: undo shortcuts +359, share links +1,162, GPX/KML/GeoJSON
  // import +1,275 (the parser and wording load lazily; this is the panel
  // control), map marker placement +649, and the title plaque +3,265 (layout,
  // anchoring and validation ship in generateGeometry, counted on the main
  // thread and in the worker). dev already sat under the 2% headroom note;
  // set to 490,000 to restore roughly 1.5%.
  // The lake depth routes (/lakes, two generated lake page templates) and the
  // custom lake map guide add route entries the studio never loads but this
  // total counts. Raised 2026-09-21: 482,942 on dev (with the head-metadata
  // change) -> 489,247 with the lake pages, leaving 0.15%; set to 500,000 to
  // restore roughly 2%. Node 22.22.2, production build.
  startupJavaScriptGzip: 500_000,
  // All routes, lazy-loaded tools, and workers, including the interactive lake
  // guide and MapLibre's worker. The fetched lake catalog is budgeted below.
  // Raised 2026-09-17 for the same two guide routes: 888,934 -> 895,695.
  // Raised again 2026-09-17 for four more guide routes: 895,695 -> 906,116.
  // Raised 2026-09-18 for machine work-area splitting.
  // Raised 2026-09-18 for water paint templates (paint-region clipping in the
  // geometry worker, the stencil writer, the export card and the cut-layer
  // overlay): measured with Node 22.22.2 at 919,013 on dev -> 922,607 on the
  // merged branch, a 3,594 byte delta.
  // Raised 2026-09-20 for splitting App.svelte into fifteen studio panel
  // components behind a shared context: measured with Node 22.22.2 at
  // 927,025 before -> 929,316 after, a 2,291 byte delta, leaving 684 bytes
  // of headroom. Set to 940,000 so ordinary studio changes fit again.
  // Raised 2026-09-20 for the same Tier 1 features: measured with Node 22.22.2
  // at 929,291 on dev -> 939,067 with all five merged, a 9,776 byte delta that
  // includes the lazy share-link and geo-import chunks, leaving 933 bytes.
  // Raised 2026-09-21 for the header rework (project and studio menus, export
  // readiness on the button, stats in the preview readout): measured with
  // Node 22.22.2 at 949,670 on dev -> 951,163, a 1,493 byte delta, when dev
  // had 330 bytes left. Set to 960,000 to restore roughly 1% headroom.
  totalJavaScriptGzip: 960_000,
  largestJavaScriptGzip: 300_000,
  // Public guides add styles outside the studio. Keep a separate allowance for
  // the Atomm template, which is loaded only inside the platform iframe.
  // Raised 2026-09-17 for the feedback tab/dialog and studio retry states:
  // measured with Node 22.22.2 at 34,290 standalone and 43,738 total.
  // Raised again 2026-09-17 for the guides sidebar, table of contents and hub:
  // measured with Node 22.14.0 at 35,197 standalone and 44,645 total.
  // Raised again 2026-09-17 for the export-files and troubleshooting guides:
  // 35,389 -> 35,965 standalone and 44,837 -> 45,413 total with Node 22.14.0.
  // Raised again 2026-09-17 for guide tables: 35,965 -> 36,583 standalone and
  // 45,413 -> 46,031 total with Node 22.14.0.
  // Raised 2026-09-21 for the example gallery and example pages: 36,731 ->
  // 37,034 with Node 22.22.2 (production build), on top of the lake pages.
  standaloneCssGzip: 37_800,
  // Raised 2026-09-20 after re-review: the same build measures 9,993 bytes
  // with Node 22.22.2 and 10,003 with supported Node 26.5.0. Leave roughly
  // 2% compression headroom; the total CSS ceiling remains unchanged.
  atommCssGzip: 10_200,
  // Raised 2026-09-21 for the lake depth pages: 46,218 on dev (with the
  // head-metadata change) -> 46,724, Node 22.22.2, production build.
  // The example gallery and example pages add 46,724 -> 47,027, still
  // inside 47,500.
  totalCssGzip: 47_500,
  // 7,775 records across 11 sources (~306 kB); fetched only when browsing/searching.
  lakeDirectoryGzip: 320_000,
  studioHtmlBytes: 10_000,
};

const files = await filesBelow(dist);
const measured = await Promise.all(files.filter((file) => /\.(?:js|css)$/.test(file.pathname)).map(async (file) => {
  const body = await readFile(file);
  return { file: decodeURIComponent(file.pathname.split("/").at(-1) ?? file.pathname), type: file.pathname.endsWith(".js") ? "js" : "css", raw: body.byteLength, gzip: gzipSync(body).byteLength };
}));
const javascript = measured.filter((entry) => entry.type === "js");
const css = measured.filter((entry) => entry.type === "css");
const totalJavaScriptGzip = javascript.reduce((total, entry) => total + entry.gzip, 0);
const largestJavaScript = javascript.toSorted((left, right) => right.gzip - left.gzip)[0];
const totalCssGzip = css.reduce((total, entry) => total + entry.gzip, 0);
const indexHtml = new URL("index.html", dist);
const indexHtmlBody = await readFile(indexHtml, "utf8");
const studioHtml = new URL("studio.html", dist);
const studioHtmlBody = await readFile(studioHtml, "utf8");
function preloads(html, page) {
  return [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => ({
      href: tag.match(/\bhref=["']([^"']+)["']/i)?.[1],
      rel: tag.match(/\brel=["']([^"']+)["']/i)?.[1],
    }))
    .filter(({ href, rel }) => href && rel?.split(/\s+/).includes("modulepreload"))
    .map(({ href }) => new URL(href, page))
    .filter((file) => file.protocol === "file:" && file.pathname.startsWith(dist.pathname));
}
async function gzipTotal(files) {
  return (await Promise.all([...new Set(files.map((file) => file.href))].map(async (href) =>
    gzipSync(await readFile(new URL(href))).byteLength
  ))).reduce((total, size) => total + size, 0);
}
const initialJavaScriptFiles = preloads(studioHtmlBody, studioHtml);
const initialJavaScriptGzip = await gzipTotal(initialJavaScriptFiles);
const landingJavaScriptGzip = await gzipTotal(preloads(indexHtmlBody, indexHtml));
const landingHtmlGzip = gzipSync(indexHtmlBody).byteLength;
const manifest = JSON.parse(await readFile(new URL("../../apps/generator/.svelte-kit/output/client/.vite/manifest.json", import.meta.url), "utf8"));
const atommStyles = new Set(Object.entries(manifest)
  .filter(([key]) => /AtommWorkbench\.svelte$/.test(key))
  .flatMap(([, entry]) => entry.css ?? [])
  .map((path) => path.split("/").at(-1)));
const atommCssGzip = css.filter((entry) => atommStyles.has(entry.file)).reduce((sum, entry) => sum + entry.gzip, 0);
const standaloneCssGzip = totalCssGzip - atommCssGzip;
const startupFiles = new Set(initialJavaScriptFiles.map((file) => file.href));
const visited = new Set();
function includeModule(key) {
  if (visited.has(key)) return;
  visited.add(key);
  const entry = manifest[key];
  if (!entry) throw new Error(`Missing startup module ${key} in build manifest.`);
  if (entry.file.endsWith(".js")) startupFiles.add(new URL(entry.file, dist).href);
  for (const dependency of entry.imports ?? []) includeModule(dependency);
}
for (const [key, entry] of Object.entries(manifest)) {
  if (entry.isEntry || /(?:ThreePreview|App)\.svelte$/.test(key)) includeModule(key);
}
// Vite emits workers as independent assets, outside the client manifest graph.
for (const file of files.filter((file) => /geometry\.worker[^/]*\.js$/.test(file.pathname))) startupFiles.add(file.href);
const startupJavaScriptGzip = (await Promise.all([...startupFiles].map(async (href) => gzipSync(await readFile(new URL(href))).byteLength))).reduce((total, size) => total + size, 0);
const studioHtmlBytes = (await stat(studioHtml)).size;

const lakeDirectoryGzip = gzipSync(await readFile(new URL("data/lake-depth-directory.json", dist))).byteLength;

const report = {
  landingJavaScriptGzip,
  landingHtmlGzip,
  initialJavaScriptGzip,
  startupJavaScriptGzip,
  totalJavaScriptGzip,
  largestJavaScriptGzip: largestJavaScript?.gzip ?? 0,
  largestJavaScriptFile: largestJavaScript?.file ?? "none",
  totalCssGzip,
  standaloneCssGzip,
  atommCssGzip,
  lakeDirectoryGzip,
  studioHtmlBytes,
};
console.log(JSON.stringify({ budgets, measured: report }, null, 2));

const failures = [
  [report.landingJavaScriptGzip, budgets.landingJavaScriptGzip, "Homepage JavaScript gzip size"],
  [report.landingHtmlGzip, budgets.landingHtmlGzip, "Homepage HTML gzip size"],
  [report.initialJavaScriptGzip, budgets.initialJavaScriptGzip, "Initial JavaScript gzip size"],
  [report.startupJavaScriptGzip, budgets.startupJavaScriptGzip, "Default-preview startup JavaScript gzip size"],
  [report.totalJavaScriptGzip, budgets.totalJavaScriptGzip, "Total JavaScript gzip size"],
  [report.largestJavaScriptGzip, budgets.largestJavaScriptGzip, "Largest JavaScript chunk gzip size"],
  [report.totalCssGzip, budgets.totalCssGzip, "Total CSS gzip size"],
  [report.standaloneCssGzip, budgets.standaloneCssGzip, "Standalone CSS gzip size"],
  [report.atommCssGzip, budgets.atommCssGzip, "Atomm CSS gzip size"],
  [report.studioHtmlBytes, budgets.studioHtmlBytes, "studio.html size"],
  [report.lakeDirectoryGzip, budgets.lakeDirectoryGzip, "Lake directory data gzip size"],
].filter(([actual, maximum]) => actual > maximum);
if (failures.length) throw new Error(failures.map(([actual, maximum, label]) => `${label} is ${actual} bytes; budget is ${maximum} bytes.`).join("\n"));
