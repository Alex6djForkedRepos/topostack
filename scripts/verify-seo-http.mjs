import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { PUBLIC_PAGES, SITE_ORIGIN } from "../apps/generator/src/lib/seo.ts";

export async function verifyHttpSeo(origin, environment) {
  assert.ok(["production", "development"].includes(environment));
  const production = environment === "production";
  const get = (path) => fetch(new URL(path, origin), { redirect: "manual", signal: AbortSignal.timeout(10_000) });
  const robots = await get("/robots.txt");
  assert.equal(robots.status, 200);
  assert.match(robots.headers.get("content-type"), /^text\/plain/);
  assert.match(await robots.text(), /^User-agent: \*\nAllow: \//);
  const sitemap = await get("/sitemap.xml");
  assert.equal(sitemap.status, 200);
  assert.match(sitemap.headers.get("content-type"), /xml/);
  const sitemapDocument = new JSDOM(await sitemap.text(), { contentType: "application/xml" }).window.document;
  const urls = [...sitemapDocument.querySelectorAll("loc")].map((node) => node.textContent);
  const publicPaths = Object.keys(PUBLIC_PAGES);
  assert.deepEqual(urls.sort(), production ? publicPaths.map((path) => SITE_ORIGIN + path).sort() : [], "Sitemap must list exactly the public pages");
  for (const path of [...publicPaths, "/studio"]) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    const document = new JSDOM(await response.text()).window.document;
    const noindex = !production || path === "/studio";
    assert.equal(document.querySelector('meta[name="robots"]')?.content.includes("noindex"), noindex, path);
    assert.equal(Boolean(response.headers.get("x-robots-tag")?.includes("noindex")), noindex, path + " header");
    assert.equal(document.querySelector('link[rel="canonical"]')?.href, "https://topostack.echofoxtrot.works" + path, path);
    assert.ok(response.headers.get("content-security-policy")?.includes("https://static.cloudflareinsights.com"));
  }
  const missing = await get("/seo-verification-missing-page");
  assert.equal(missing.status, 404, "Unknown URLs must return HTTP 404");
  for (const path of ["/about", "/about/"]) {
    const response = await get(path);
    assert.equal(response.status, 308, path + " permanent redirect");
    assert.equal(new URL(response.headers.get("location"), origin).pathname, "/");
  }
  const image = await get("/images/studio-crater-lake.png");
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /image\/png/);
  console.log("Verified " + environment + " SEO response semantics at " + origin);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyHttpSeo(process.argv[2], process.argv[3]);
}
