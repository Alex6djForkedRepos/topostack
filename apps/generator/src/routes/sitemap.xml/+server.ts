import { PUBLIC_PAGES, SITE_ORIGIN } from "../../lib/seo";
export const prerender = true;
export function GET(): Response {
  const paths = import.meta.env.VITE_SITE_ENV === "production" ? Object.keys(PUBLIC_PAGES) : [];
  const entries = paths.map((path) => "<url><loc>" + SITE_ORIGIN + path + "</loc></url>").join("");
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + entries + "</urlset>", { headers: { "content-type": "application/xml; charset=utf-8" } });
}
