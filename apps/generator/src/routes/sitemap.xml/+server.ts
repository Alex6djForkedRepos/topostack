import { PUBLIC_PAGES, SITE_ORIGIN } from "$lib/site/seo";
import { LAKE_PAGES } from "$lib/site/lake-pages.server";
export const prerender = true;
export function GET(): Response {
  const production = import.meta.env.VITE_SITE_ENV === "production";
  // lastmod is the recorded date of the last significant content change, not
  // the build date: a value that moved on every deploy would be ignored.
  const pages = production ? [
    ...Object.entries(PUBLIC_PAGES).map(([path, meta]) => [path, meta.updated] as const),
    ...[...LAKE_PAGES.values()].map((page) => [page.path, page.updated] as const),
  ] : [];
  const entries = pages.map(([path, updated]) => "<url><loc>" + SITE_ORIGIN + path + "</loc><lastmod>" + updated + "</lastmod></url>").join("");
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + entries + "</urlset>", { headers: { "content-type": "application/xml; charset=utf-8" } });
}
