import { lakePageIndex } from "$lib/site/lake-pages.server";

export const prerender = true;

// Lake id → slug of its /lake/<slug> page, for the in-browser directory search.
// Built from the same slug lock as the pages, and fetched only by that search.
export function GET(): Response {
  return new Response(JSON.stringify(lakePageIndex()), { headers: { "content-type": "application/json; charset=utf-8" } });
}
