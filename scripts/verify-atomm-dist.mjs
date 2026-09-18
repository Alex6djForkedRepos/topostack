import { validateStaticHeaders } from "./lib/static-headers.mjs";
import { readFile, stat } from "node:fs/promises";
import { isForbiddenApiHost } from "./lib/api-host.mjs";
import { filesBelow } from "./lib/files.mjs";

// `--skip-endpoint-scan` is used only by the CI validate job, whose build
// intentionally embeds the hermetic `https://ci.invalid` sentinel so tests
// cannot reach real services. Every packaging path (`package:atomm`,
// `release:atomm`) runs the full scan.
const skipEndpointScan = process.argv.includes("--skip-endpoint-scan");

const indexPath = new URL("../apps/generator/dist/index.html", import.meta.url);
const index = await readFile(indexPath, "utf8");
if (process.argv.includes("--require-sdk-entry")) {
  const sdkCount = (index.match(/src="https:\/\/static-res\.makextool\.com\/scripts\/js\/generator-sdk\/platform-sdk\.js"/g) ?? []).length;
  if (sdkCount !== 1) throw new Error("The Atomm entry page must include exactly one platform SDK script.");
  if (index.includes('class="landing-page"')) throw new Error("The Atomm entry page must open the workbench, not the marketing homepage.");
}
const studio = await readFile(new URL("../apps/generator/dist/studio.html", import.meta.url), "utf8");
const headers = await readFile(new URL("../apps/generator/dist/_headers", import.meta.url), "utf8");
validateStaticHeaders(headers);
if (headers.includes("__TOPOSTACK_SCRIPT_HASHES__") || /script-src[^;]*unsafe-inline/.test(headers) || !/script-src[^;]*sha256-/.test(headers)) throw new Error("Production security headers do not contain finalized inline-script hashes.");
if (!studio.includes("https://static-res.makextool.com/scripts/js/generator-sdk/platform-sdk.js")) throw new Error("Atomm SDK is missing from the terrain studio.");
if (!index.includes("https://static-res.makextool.com/scripts/js/generator-sdk/platform-sdk.js") && !/href=["'][^"']*studio["']/.test(index)) throw new Error("The homepage does not link to the terrain studio.");
const distDirectory = new URL("../apps/generator/dist/", import.meta.url);
const distFiles = await filesBelow(distDirectory);
const scripts = distFiles.filter((file) => file.pathname.endsWith(".js"));
if (!scripts.length) throw new Error("Production artifact contains no JavaScript application files.");
const searchable = [index, studio, ...await Promise.all(scripts.map((file) => readFile(file, "utf8")))].join("\n");

if (!skipEndpointScan) {
  const embeddedHosts = [...searchable.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((match) => match[1]);
  const forbidden = embeddedHosts.filter((host) => isForbiddenApiHost(host));
  if (forbidden.length) throw new Error(`Production artifact contains development or placeholder API endpoints: ${[...new Set(forbidden)].join(", ")}`);
}

if (/\b(?:src|href)=["']\/(?!\/)/.test(index + studio)) throw new Error("Production pages contain root-relative assets that may fail in Atomm.");
const size = (await stat(indexPath)).size;
if (size <= 0) throw new Error("Production entry page is empty.");
