import { sitemapResponse } from "$lib/site/sitemap.server";
export const prerender = true;
export function GET(): Response {
  return sitemapResponse("/sitemap-lakes.xml");
}
