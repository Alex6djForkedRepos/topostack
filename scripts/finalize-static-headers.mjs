import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

const dist = new URL("../apps/generator/dist/", import.meta.url);
// Each prerendered route has its own bootstrap script. Authorize all page
// scripts so secondary pages can hydrate under the shared static CSP.
const pages = (await readdir(dist, { recursive: true })).filter((path) => path.endsWith(".html"));
const html = (await Promise.all(pages.map((path) => readFile(new URL(path, dist), "utf8")))).join("\n");
const headersUrl = new URL("_headers", dist);
let headers = await readFile(headersUrl, "utf8");
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((script) => script.trim())
  .map((script) => "'sha256-" + createHash("sha256").update(script).digest("base64") + "'");
if (!hashes.length) throw new Error("No inline scripts were found to hash for the Content Security Policy.");
if (!headers.includes("__TOPOSTACK_SCRIPT_HASHES__")) throw new Error("The static headers file is missing its script-hash placeholder.");
headers = headers.replace("__TOPOSTACK_SCRIPT_HASHES__", [...new Set(hashes)].join(" "));
await writeFile(headersUrl, headers);
