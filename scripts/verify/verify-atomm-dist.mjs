import { validateStaticHeaders } from "../lib/static-headers.mjs";
import { readFile, stat } from "node:fs/promises";
import { forbiddenHostsIn } from "../lib/api-host.mjs";
import { filesBelow } from "../lib/files.mjs";
import { SITE_ONLY_PATHS } from "../lib/atomm-site-only.mjs";

// `--skip-endpoint-scan` is used only by the CI validate job, whose build
// intentionally embeds the hermetic `https://ci.invalid` sentinel so tests
// cannot reach real services. Every packaging path (`package:atomm`,
// `release:atomm`) runs the full scan.
const skipEndpointScan = process.argv.includes("--skip-endpoint-scan");

const indexPath = new URL("../../apps/generator/dist/index.html", import.meta.url);
const index = await readFile(indexPath, "utf8");
if (process.argv.includes("--require-sdk-entry")) {
  const sdkCount = (index.match(/src="https:\/\/static-res\.makextool\.com\/scripts\/js\/generator-sdk\/platform-sdk\.js"/g) ?? []).length;
  if (sdkCount !== 1) throw new Error("The Atomm entry page must include exactly one platform SDK script.");
  if (index.includes('class="landing-page"')) throw new Error("The Atomm entry page must open the workbench, not the marketing homepage.");
}
const studio = await readFile(new URL("../../apps/generator/dist/studio.html", import.meta.url), "utf8");
const headers = await readFile(new URL("../../apps/generator/dist/_headers", import.meta.url), "utf8");
validateStaticHeaders(headers);
if (headers.includes("__TOPOSTACK_SCRIPT_HASHES__") || /script-src[^;]*unsafe-inline/.test(headers) || !/script-src[^;]*sha256-/.test(headers)) throw new Error("Production security headers do not contain finalized inline-script hashes.");
if (!studio.includes("https://static-res.makextool.com/scripts/js/generator-sdk/platform-sdk.js")) throw new Error("Atomm SDK is missing from the terrain studio.");
if (!index.includes("https://static-res.makextool.com/scripts/js/generator-sdk/platform-sdk.js") && !/href=["'][^"']*studio["']/.test(index)) throw new Error("The homepage does not link to the terrain studio.");
const distDirectory = new URL("../../apps/generator/dist/", import.meta.url);
const distFiles = await filesBelow(distDirectory);
if (process.argv.includes("--require-sdk-entry")) {
  // The Atomm package is the studio alone: its pages, the credits page it
  // links to, and what it fetches at runtime. The public site stays out.
  const packaged = distFiles.map((file) => file.pathname.slice(distDirectory.pathname.length));
  const allowedPages = new Set(["index.html", "studio.html", "attribution.html", "404.html"]);
  const sitePages = packaged.filter((file) => file.endsWith(".html") && !allowedPages.has(file));
  const siteAssets = packaged.filter((file) => SITE_ONLY_PATHS.some((path) => file === path || file.startsWith(`${path}/`)));
  if (sitePages.length || siteAssets.length) throw new Error(`The Atomm package contains public site files: ${[...sitePages, ...siteAssets].slice(0, 8).join(", ")}${sitePages.length + siteAssets.length > 8 ? ", …" : ""}`);
  if (!packaged.includes("data/lake-depth-directory.json")) throw new Error("The Atomm package is missing the lake directory that place search reads.");
}
const scripts = distFiles.filter((file) => file.pathname.endsWith(".js"));
if (!scripts.length) throw new Error("Production artifact contains no JavaScript application files.");
// Scanned file by file, so a host a bundled library only writes into its own
// code (see LIBRARY_HOSTS) is excused there and nowhere else.
const searchable = [index, studio, ...await Promise.all(scripts.map((file) => readFile(file, "utf8")))];

if (!skipEndpointScan) {
  const forbidden = searchable.flatMap((text) => forbiddenHostsIn(text));
  if (forbidden.length) throw new Error(`Production artifact contains development or placeholder API endpoints: ${[...new Set(forbidden)].join(", ")}`);
}

if (/\b(?:src|href)=["']\/(?!\/)/.test(index + studio)) throw new Error("Production pages contain root-relative assets that may fail in Atomm.");
const size = (await stat(indexPath)).size;
if (size <= 0) throw new Error("Production entry page is empty.");
