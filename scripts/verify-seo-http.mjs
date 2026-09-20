import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { PUBLIC_PAGES, SITE_ORIGIN, socialImage } from "../apps/generator/src/lib/site/seo.ts";

// Deployment assets can become available shortly after the Worker itself.
// Only callers verifying a fresh deployment opt into a shared retry window.
export async function fetchSeoResponse(url, { expectedStatus = 200, deadline = 0, retryDelayMs = 3_000 } = {}) {
  while (true) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const retryable = response.status === 429 || response.status >= 500
      || (response.status === 404 && expectedStatus === 200);
    if (response.status === expectedStatus || !retryable || Date.now() + retryDelayMs >= deadline) return response;
    await response.body?.cancel();
    console.warn(`SEO response ${response.status} for ${url}; waiting for deployment assets.`);
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

/**
 * The sitemap is a prerendered asset the edge cache may still serve from the
 * previous deployment for a short while after the Worker itself is live, so a
 * fresh deployment keeps re-reading it until it lists the expected pages or
 * the propagation window closes. Returns the last URL list read, sorted.
 *
 * `lastmod` maps each expected URL to the content date the build recorded for
 * it. Callers that know those dates pass them so the deployed sitemap is
 * checked in the same read that confirmed propagation.
 */
export async function fetchSitemapUrls(url, expected, { deadline = 0, retryDelayMs = 3_000, lastmod } = {}) {
  const wanted = [...expected].sort();
  while (true) {
    const sitemap = await fetchSeoResponse(url, { deadline, retryDelayMs });
    assert.equal(sitemap.status, 200);
    assert.match(sitemap.headers.get("content-type"), /xml/);
    const sitemapDocument = new JSDOM(await sitemap.text(), { contentType: "application/xml" }).window.document;
    const urls = [...sitemapDocument.querySelectorAll("loc")].map((node) => node.textContent).sort();
    if (urls.length === wanted.length && urls.every((entry, index) => entry === wanted[index])) {
      for (const entry of lastmod ? sitemapDocument.querySelectorAll("url") : []) {
        const loc = entry.querySelector("loc").textContent;
        assert.equal(entry.querySelector("lastmod")?.textContent, lastmod[loc], loc + ": deployed lastmod");
      }
      return urls;
    }
    if (Date.now() + retryDelayMs >= deadline) return urls;
    console.warn(`Sitemap at ${url} does not list the expected pages yet; waiting for deployment assets.`);
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
}

export async function verifyHttpSeo(origin, environment, { propagationTimeoutMs = 0 } = {}) {
  assert.ok(["production", "development"].includes(environment));
  const production = environment === "production";
  const deadline = Date.now() + propagationTimeoutMs;
  const get = (path, expectedStatus = 200) => fetchSeoResponse(new URL(path, origin), { expectedStatus, deadline });
  const robots = await get("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get("content-type"), /^text\/plain/);
  assert.match(await robots.text(), /^User-agent: \*\nAllow: \//);
  const publicPaths = Object.keys(PUBLIC_PAGES);
  const expectedUrls = production ? publicPaths.map((path) => SITE_ORIGIN + path).sort() : [];
  const recordedDates = Object.fromEntries(publicPaths.map((path) => [SITE_ORIGIN + path, PUBLIC_PAGES[path].updated]));
  const urls = await fetchSitemapUrls(new URL("/sitemap.xml", origin), expectedUrls, { deadline, lastmod: production ? recordedDates : undefined });
  assert.deepEqual(urls, expectedUrls, "Sitemap must list exactly the public pages");
  for (const path of [...publicPaths, "/studio"]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    const document = new JSDOM(await response.text()).window.document;
    const noindex = !production || path === "/studio";
    assert.equal(document.querySelector('meta[name="robots"]')?.content.includes("noindex"), noindex, path);
    assert.equal(Boolean(response.headers.get("x-robots-tag")?.includes("noindex")), noindex, path + " header");
    assert.equal(document.querySelector('link[rel="canonical"]')?.href, "https://topostack.app" + path, path);
    assert.ok(response.headers.get("content-security-policy")?.includes("https://static.cloudflareinsights.com"));
  }
  const llms = await get("/llms.txt");
  assert.equal(llms.status, 200);
  assert.match(llms.headers.get("content-type"), /^text\/plain/, "llms.txt must not be served as HTML");
  assert.match(await llms.text(), /^# TopoStack\n/);
  const missing = await get("/seo-verification-missing-page", 404);
  assert.equal(missing.status, 404, "Unknown URLs must return HTTP 404");
  for (const path of ["/about", "/about/"]) {
    const response = await get(path, 308);
    assert.equal(response.status, 308, path + " permanent redirect");
    assert.equal(new URL(response.headers.get("location"), origin).pathname, "/");
  }
  const image = await get("/images/studio-crater-lake.png");
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /image\/png/);
  // Every declared sharing card must actually be fetchable: a 404 here means
  // link previews render without an image wherever the page is shared.
  for (const url of new Set(publicPaths.map((path) => socialImage(path).url))) {
    const card = await get(url);
    assert.equal(card.status, 200, url + " sharing card");
    assert.match(card.headers.get("content-type"), /^image\//, url + " content type");
  }
  console.log("Verified " + environment + " SEO response semantics at " + origin);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // A fresh deployment's assets can lag the Worker, so the deploy job passes a
  // propagation window; monitors leave it unset and fail immediately.
  const propagation = Number(process.env.SEO_PROPAGATION_TIMEOUT_MS ?? 0);
  assert.ok(Number.isFinite(propagation) && propagation >= 0, "SEO_PROPAGATION_TIMEOUT_MS must be a non-negative number of milliseconds");
  await verifyHttpSeo(process.argv[2], process.argv[3], { propagationTimeoutMs: propagation });
}
