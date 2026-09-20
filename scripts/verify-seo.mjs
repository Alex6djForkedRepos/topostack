import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { PUBLIC_PAGES, headline, isArticlePage, socialImage } from "../apps/generator/src/lib/seo.ts";

const environment = process.argv[process.argv.indexOf("--environment") + 1];
assert.ok(["production", "development", "atomm"].includes(environment), "Pass --environment production, development, or atomm");
const production = environment === "production";
const origin = "https://topostack.app";
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
  // Declared card dimensions must match the page's own image, or consumers that
  // trust the tags without fetching the file lay the preview out wrongly.
  const image = socialImage(path);
  assert.equal(document.querySelector('meta[property="og:image"]').content, origin + image.url, file + ": og:image");
  assert.equal(document.querySelector('meta[name="twitter:image"]').content, origin + image.url, file + ": twitter:image");
  assert.equal(document.querySelector('meta[property="og:image:width"]').content, String(image.width), file + ": og:image:width");
  assert.equal(document.querySelector('meta[property="og:image:height"]').content, String(image.height), file + ": og:image:height");
  assert.equal(document.querySelector('meta[property="og:image:alt"]').content, image.alt, file + ": og:image:alt");
  assert.equal(document.querySelector('meta[name="twitter:card"]').content, "summary_large_image");
  assert.equal(document.querySelector('meta[property="og:locale"]').content, "en_US", file + ": og:locale");
  const sharedImage = builtPaths.includes(image.url.slice(1)) && (await stat(new URL(image.url.slice(1), dist))).isFile();
  assert.ok(sharedImage, file + ": sharing image " + image.url + " is missing from the build");
  const structured = document.querySelector('script[type="application/ld+json"]');
  assert.ok(structured, file + ": structured data");
  const graph = JSON.parse(structured.textContent)["@graph"];
  assert.ok(graph.length);
  // Guides and examples carry dated article metadata; hubs and policy pages
  // must not claim a publication date they do not have.
  const articleNode = graph.find((node) => node["@type"] === "TechArticle");
  const meta = PUBLIC_PAGES[path];
  assert.equal(Boolean(articleNode), Boolean(meta) && isArticlePage(path), file + ": article metadata policy");
  if (articleNode) {
    assert.equal(articleNode.headline, headline(meta.title), file + ": article headline matches the page title");
    assert.equal(articleNode.datePublished, meta.published, file + ": datePublished");
    assert.equal(articleNode.dateModified, meta.updated, file + ": dateModified");
    assert.equal(articleNode.mainEntityOfPage, origin + path, file + ": article canonical");
    assert.equal(document.querySelector('meta[property="og:type"]').content, "article", file + ": og:type");
    assert.equal(document.querySelector('meta[property="article:modified_time"]').content, meta.updated, file + ": article:modified_time");
  }
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
// lastmod must be the recorded content date. A build date on every entry is a
// signal search engines learn to ignore, so it is rejected here.
const today = new Date().toISOString().slice(0, 10);
for (const entry of sitemap.querySelectorAll("url")) {
  const path = entry.querySelector("loc").textContent.slice(origin.length);
  const lastmod = entry.querySelector("lastmod")?.textContent;
  assert.ok(lastmod, path + ": sitemap lastmod");
  assert.equal(lastmod, PUBLIC_PAGES[path].updated, path + ": lastmod must match the recorded page date");
  assert.ok(lastmod <= today, path + ": lastmod is in the future");
}
// The assistant index must describe exactly the pages that are indexable, so
// it cannot advertise a page that robots and the sitemap exclude.
const llms = await readFile(new URL("llms.txt", dist), "utf8");
assert.ok(llms.startsWith("# TopoStack\n"), "llms.txt heading");
assert.ok(!llms.includes("<html"));
const listed = [...llms.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((match) => match[1]).filter((url) => url.startsWith(origin));
assert.deepEqual(listed.filter((url) => url !== origin + "/studio").sort(), indexable.toSorted(), "llms.txt must list exactly the indexable pages");
assert.equal(listed.includes(origin + "/studio"), production, "llms.txt names the studio and says why it is excluded");
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
assert.ok((await readFile(new URL("images/social-crater-lake.png", dist))).byteLength > 0);
console.log("Verified " + environment + " metadata, crawl files, links, sharing image and indexing policy (" + files.length + " HTML files).");
