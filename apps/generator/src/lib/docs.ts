import { DOCS_HOME, PUBLIC_PAGES } from "./seo";

export { DOCS_HOME };

/**
 * Navigation order for the guides area. Every public page except the homepage
 * belongs to exactly one section; docs.test.ts enforces that so new pages
 * cannot be published without a place in the sidebar.
 */
export const DOCS_SECTIONS: readonly { id: string; title: string; summary: string; paths: readonly string[] }[] = [
  {
    id: "make",
    title: "Make a map",
    summary: "Step-by-step workflows from choosing a place to importing SVG files into your laser software.",
    paths: ["/guides/laser-cut-topographic-map", "/guides/topographic-map-engraving", "/examples/crater-lake"],
  },
  {
    id: "lakes",
    title: "Lakes and depth",
    summary: "How TopoStack builds lake floors from surveys and terrain, and which lakes have surveyed data.",
    paths: ["/guides/how-lake-depths-work", "/guides/lake-depth-data"],
  },
  {
    id: "reference",
    title: "Reference",
    summary: "Data sources, credits, licenses and how the site handles your projects.",
    paths: ["/attribution", "/privacy"],
  },
];

export interface DocLink { path: string; label: string; description: string }

function link(path: string): DocLink {
  const metadata = PUBLIC_PAGES[path];
  if (!metadata) throw new Error(`Guide ${path} is missing from PUBLIC_PAGES`);
  return { path, label: metadata.label, description: metadata.description };
}

export const DOCS_NAV = DOCS_SECTIONS.map((section) => ({ ...section, links: section.paths.map(link) }));

const ORDER: DocLink[] = [link(DOCS_HOME), ...DOCS_NAV.flatMap((section) => section.links)];

export function docsSection(path: string): (typeof DOCS_NAV)[number] | undefined {
  return DOCS_NAV.find((section) => section.paths.includes(path));
}

export function docsNeighbours(path: string): { previous?: DocLink; next?: DocLink } {
  const index = ORDER.findIndex((entry) => entry.path === path);
  if (index < 0) return {};
  return { previous: ORDER[index - 1], next: ORDER[index + 1] };
}

export function headingId(text: string, taken: Set<string>): string {
  const slug = text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "section";
  let id = slug;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${slug}-${suffix}`;
  taken.add(id);
  return id;
}
