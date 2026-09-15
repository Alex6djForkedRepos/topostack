import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";

const siteEnvironment = process.env.VITE_SITE_ENV ?? "development";
if (!["production", "development", "atomm"].includes(siteEnvironment)) throw new Error("VITE_SITE_ENV must be production, development, or atomm.");
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
// Meta directives also protect the standalone artifact. These headers cover all
// static responses on non-production builds and the editor in production.
if (siteEnvironment === "production") {
  headers += "\n/studio\n  X-Robots-Tag: noindex, follow\n\n/studio.html\n  X-Robots-Tag: noindex, follow\n";
} else {
  // Duplicate path blocks replace one another in Workers. Add this to the
  // existing global block so development keeps its security headers.
  headers = headers.replace("/*\n", "/*\n  X-Robots-Tag: noindex, follow\n");
}
await writeFile(headersUrl, headers);
