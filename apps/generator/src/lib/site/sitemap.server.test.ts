import { afterEach, describe, expect, it, vi } from "vitest";
import { LAKE_PAGES } from "$lib/site/lake-pages.server";
import { SITE_ORIGIN } from "$lib/site/seo";
import { SITEMAPS, lakeSitemapEntries, pageSitemapEntries, sitemapIndexResponse, sitemapResponse } from "$lib/site/sitemap.server";

const locs = (xml: string): string[] => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!);

describe("sitemaps", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("splits generated lake pages from every other page", () => {
    const lakes = lakeSitemapEntries().map((entry) => entry.path);
    expect(lakes.toSorted()).toEqual([...LAKE_PAGES.keys()].sort());
    expect(lakes.every((path) => path.startsWith("/lakes/"))).toBe(true);
    const pages = pageSitemapEntries().map((entry) => entry.path);
    expect(pages).toContain("/lakes");
    expect(pages.filter((path) => lakes.includes(path))).toEqual([]);
  });

  it("indexes both child sitemaps with their newest content date in production", async () => {
    vi.stubEnv("VITE_SITE_ENV", "production");
    const index = await sitemapIndexResponse().text();
    expect(index).toContain("<sitemapindex");
    expect(locs(index)).toEqual(SITEMAPS.map((path) => SITE_ORIGIN + path));
    const newestLake = lakeSitemapEntries().map((entry) => entry.updated).sort().at(-1);
    expect(index).toContain(`<loc>${SITE_ORIGIN}/sitemap-lakes.xml</loc><lastmod>${newestLake}</lastmod>`);
    const lakes = await sitemapResponse("/sitemap-lakes.xml").text();
    expect(locs(lakes)).toEqual(lakeSitemapEntries().map((entry) => SITE_ORIGIN + entry.path));
  });

  it("publishes empty sitemaps outside production", async () => {
    vi.stubEnv("VITE_SITE_ENV", "development");
    expect(locs(await sitemapIndexResponse().text())).toEqual([]);
    for (const path of SITEMAPS) expect(locs(await sitemapResponse(path).text())).toEqual([]);
  });
});
