import { DOCS_SECTIONS } from "$lib/site/docs";
import { PUBLIC_PAGES, REPOSITORY_URL, SITE_ORIGIN, headline } from "$lib/site/seo";
import { LAKE_PAGES } from "$lib/site/lake-pages.server";
export const prerender = true;

// An index of the same pages the sitemap lists, in reading order, for
// assistants that fetch one file instead of crawling. It is a convenience, not
// an access control: robots.txt and the page metadata remain authoritative.
export function GET(): Response {
  if (import.meta.env.VITE_SITE_ENV !== "production") {
    return new Response("# TopoStack\n\n> Non-production build. See https://topostack.app/llms.txt\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  const entry = (path: string): string => {
    const meta = PUBLIC_PAGES[path]!;
    return `- [${headline(meta.title)}](${SITE_ORIGIN}${path}): ${meta.description}`;
  };
  const body = [
    "# TopoStack",
    "",
    `> ${PUBLIC_PAGES["/"]!.description}`,
    "",
    "TopoStack runs entirely in the browser and needs no account. Terrain and map data are fetched from public sources on demand; projects are stored in the browser, not on a server. Exports are SVG files at a chosen physical size, either layered cut panels for a stacked relief or a single flat engraving.",
    "",
    "## Start here",
    "",
    entry("/"),
    entry("/guides"),
    `- [Studio](${SITE_ORIGIN}/studio): the editor itself. It is a browser application rather than a document, and is intentionally excluded from search indexes.`,
    ...DOCS_SECTIONS.flatMap((section) => ["", `## ${section.title}`, "", ...section.paths.map(entry)]),
    "",
    "## Lake depth maps",
    "",
    "Generated from the surveyed lake directory: one page per region, split by county or initial letter where a region is large.",
    "",
    ...[...LAKE_PAGES.values()].map((page) => `- [${headline(page.title)}](${SITE_ORIGIN}${page.path}): ${page.description}`),
    "",
    "## Optional",
    "",
    `- [Source code](${REPOSITORY_URL}): the repository behind the site.`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
