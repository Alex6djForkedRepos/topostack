import { SITE_ORIGIN } from "$lib/site/seo";
export const prerender = true;
export function GET(): Response {
  const sitemap = import.meta.env.VITE_SITE_ENV === "production" ? "\nSitemap: " + SITE_ORIGIN + "/sitemap.xml\n" : "";
  return new Response("User-agent: *\nAllow: /\n" + sitemap, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
