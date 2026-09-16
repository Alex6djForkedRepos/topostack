import { readdir, readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const dist = new URL("../apps/generator/dist/", import.meta.url);
// Budget the lightweight homepage separately from the editor and its default
// 3D preview. Moving the editor must not hide its cost behind a smaller entry page.
const budgets = {
  // Search metadata and attribution share the UI chunk with platform controls.
  // The integrated release measures ~52.7 kB gzip for the homepage.
  landingJavaScriptGzip: 54_000,
  landingHtmlGzip: 10_000,
  initialJavaScriptGzip: 180_000,
  // Directory-to-studio links add location restoration and router integration.
  // Survey selection framing and duplicate coverage-warning handling add <1 kB.
  // Atomm control adapters and surveyed-lake selection measure ~405 kB total.
  startupJavaScriptGzip: 406_000,
  // Includes the MapLibre 6 worker (~144 kB gzip), fetched only in Map mode.
  // The searchable lake directory adds a separate guide route. Allow 8 kB
  // for its JS while keeping the homepage and initial-entry limits.
  // Its full lake catalog is fetched separately and budgeted below.
  // Full-catalog location search adds ~2.2 kB, loaded with the search dialog.
  // Full integrated release measures ~838.1 kB across all routes.
  totalJavaScriptGzip: 840_000,
  largestJavaScriptGzip: 300_000,
  // The fetched Atomm template is loaded only inside the platform iframe.
  // Keep the original standalone CSS allowance and bound the extra surface.
  standaloneCssGzip: 31_000,
  atommCssGzip: 10_000,
  totalCssGzip: 41_000,
  // 7,775 records across 11 sources (~306 kB); fetched only when browsing/searching.
  lakeDirectoryGzip: 320_000,
  studioHtmlBytes: 10_000,
};

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    return entry.isDirectory() ? filesBelow(target) : [target];
  }))).flat();
}

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
const manifest = JSON.parse(await readFile(new URL("../apps/generator/.svelte-kit/output/client/.vite/manifest.json", import.meta.url), "utf8"));
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
