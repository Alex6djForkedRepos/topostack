import { PUBLIC_PAGES, SITE_ORIGIN } from "$lib/site/seo";
import { LAKE_PAGES, LAKE_PLACES } from "$lib/site/lake-pages.server";
import { examplePath } from "$lib/site/examples";
import { PUBLISHED_EXAMPLES } from "$lib/site/examples.server";

/**
 * The sitemap is an index of two child sitemaps so Search Console reports
 * indexing per group: the registered pages and examples, and the generated
 * lake pages, whose indexed share is the early warning for thin content.
 */
export interface SitemapEntry { path: string; updated: string }

/** Child sitemaps in the order `/sitemap.xml` lists them. */
export const SITEMAPS = ["/sitemap-pages.xml", "/sitemap-lakes.xml"] as const;
export type SitemapPath = (typeof SITEMAPS)[number];

/** Only the production build is indexable; other builds publish empty sitemaps. */
const production = (): boolean => import.meta.env.VITE_SITE_ENV === "production";

/** Registered public pages and published examples: everything that is not a generated lake page. */
export function pageSitemapEntries(): SitemapEntry[] {
  return [
    ...Object.entries(PUBLIC_PAGES).map(([path, meta]) => ({ path, updated: meta.updated })),
    ...PUBLISHED_EXAMPLES.map((example) => ({ path: examplePath(example.slug), updated: example.updated })),
  ];
}

/** Every generated lake page. Add new generated lake routes here so the lakes sitemap lists them. */
export function lakeSitemapEntries(): SitemapEntry[] {
  return [...LAKE_PAGES.values(), ...LAKE_PLACES.values()].map((page) => ({ path: page.path, updated: page.updated }));
}

const ENTRIES: Record<SitemapPath, () => SitemapEntry[]> = {
  "/sitemap-pages.xml": pageSitemapEntries,
  "/sitemap-lakes.xml": lakeSitemapEntries,
};

const xml = (body: string): Response => new Response('<?xml version="1.0" encoding="UTF-8"?>' + body, { headers: { "content-type": "application/xml; charset=utf-8" } });
const newest = (entries: SitemapEntry[]): string | undefined => entries.map((entry) => entry.updated).sort().at(-1);

// lastmod is the recorded date of the last significant content change, not
// the build date: a value that moved on every deploy would be ignored.
export function sitemapResponse(sitemap: SitemapPath): Response {
  const entries = production() ? ENTRIES[sitemap]() : [];
  const urls = entries.map(({ path, updated }) => "<url><loc>" + SITE_ORIGIN + path + "</loc><lastmod>" + updated + "</lastmod></url>").join("");
  return xml('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + "</urlset>");
}

/** The index's lastmod for each child is the newest content date it lists. */
export function sitemapIndexResponse(): Response {
  const children = production() ? SITEMAPS.map((path) => {
    const lastmod = newest(ENTRIES[path]());
    return "<sitemap><loc>" + SITE_ORIGIN + path + "</loc>" + (lastmod ? "<lastmod>" + lastmod + "</lastmod>" : "") + "</sitemap>";
  }).join("") : "";
  return xml('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + children + "</sitemapindex>");
}
