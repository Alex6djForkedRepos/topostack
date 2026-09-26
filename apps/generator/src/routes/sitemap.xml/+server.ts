import { sitemapIndexResponse } from "$lib/site/sitemap.server";
export const prerender = true;
export function GET(): Response {
  return sitemapIndexResponse();
}
