import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { JSDOM } from "jsdom";

const environment = process.argv[process.argv.indexOf("--environment") + 1];
assert.ok(["production", "development", "atomm"].includes(environment), "Pass --environment production, development, or atomm");
const production = environment === "production";
const origin = "https://topostack.echofoxtrot.works";
const dist = new URL("../apps/generator/dist/", import.meta.url);
const builtPaths = await readdir(dist, { recursive: true });
const files = builtPaths.filter((path) => path.endsWith(".html"));
const indexable = [];
const titles = new Set();
for (const file of files) {
  const html = await readFile(new URL(file, dist), "utf8");
  const document = new JSDOM(html).window.document;
  if (file === "about.html") continue; // Static adapter's portable refresh fallback.
  const path = file === "index.html" ? "/" : "/" + file.replace(/\.html$/, "");
  assert.equal(document.head.querySelectorAll("title").length, 1, file + ": unique title");
  const robots = document.querySelector('meta[name="robots"]')?.content;
  assert.ok(robots, file + ": robots policy");
  const noindex = !production || ["/studio", "/404"].includes(path);
  assert.equal(robots.includes("noindex"), noindex, file + ": indexing policy");
  if (path === "/404") continue;
  assert.ok(document.querySelector('meta[name="description"]')?.content, file + ": description");
  assert.equal(document.querySelectorAll('link[rel="canonical"]').length, 1, file + ": unique canonical");
  assert.equal(document.querySelector('link[rel="canonical"]').href, origin + path, file + ": production canonical");
  assert.ok(!titles.has(document.title), file + ": distinct title");
  titles.add(document.title);
  assert.equal(document.querySelectorAll("h1").length, 1, file + ": useful initial HTML");
  assert.equal(document.querySelector('meta[property="og:image"]').content, origin + "/images/studio-crater-lake.png");
  assert.equal(document.querySelector('meta[name="twitter:card"]').content, "summary_large_image");
  const structured = document.querySelector('script[type="application/ld+json"]');
  assert.ok(structured, file + ": structured data");
  assert.ok(JSON.parse(structured.textContent)["@graph"].length);
  if (!noindex) indexable.push(origin + path);
  for (const anchor of document.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href");
    if (href.startsWith("#") || /^(https?:|mailto:)/.test(href)) continue;
    const target = new URL(href, origin + path).pathname;
    const expectedFile = target === "/" ? "index.html" : target.slice(1) + ".html";
    const assetPath = target.slice(1);
    const assetExists = builtPaths.includes(assetPath) && (await stat(new URL(assetPath, dist))).isFile();
    assert.ok(files.includes(expectedFile) || assetExists, file + ": broken internal link " + href);
  }
}
const sitemap = new JSDOM(await readFile(new URL("sitemap.xml", dist), "utf8"), { contentType: "application/xml" }).window.document;
assert.equal(sitemap.documentElement.localName, "urlset");
const urls = [...sitemap.querySelectorAll("loc")].map((node) => node.textContent).sort();
assert.deepEqual(urls, indexable.sort(), "Sitemap must list exactly the indexable built pages");
const robots = await readFile(new URL("robots.txt", dist), "utf8");
assert.ok(robots.startsWith("User-agent: *\nAllow: /\n"));
assert.equal(robots.includes("Sitemap: " + origin + "/sitemap.xml"), production);
assert.ok(!robots.includes("<html"));
const headers = await readFile(new URL("_headers", dist), "utf8");
assert.ok(headers.includes("https://static.cloudflareinsights.com"), "Analytics allowed by CSP");
assert.ok(headers.includes("X-Robots-Tag: noindex, follow"));
const headerPaths = headers.split("\n").filter((line) => line.startsWith("/"));
assert.equal(new Set(headerPaths).size, headerPaths.length, "Duplicate header blocks can discard security headers");
assert.equal(/\/\*\n {2}X-Robots-Tag: noindex/.test(headers), !production, "Global noindex is non-production only");
const redirects = await readFile(new URL("_redirects", dist), "utf8");
assert.ok(redirects.includes("/about / 308"));
assert.ok((await readFile(new URL("images/studio-crater-lake.png", dist))).byteLength > 0);
console.log("Verified " + environment + " metadata, crawl files, links, sharing image and indexing policy (" + files.length + " HTML files).");
