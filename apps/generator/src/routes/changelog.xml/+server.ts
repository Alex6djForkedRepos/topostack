import { atomFeed } from "$lib/site/changelog.server";
export const prerender = true;

export function GET(): Response {
  return new Response(atomFeed(), { headers: { "content-type": "application/atom+xml; charset=utf-8" } });
}
