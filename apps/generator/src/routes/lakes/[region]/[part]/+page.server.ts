import { error } from "@sveltejs/kit";
import { LAKE_PAGES } from "$lib/site/lake-pages.server";
import { LAKES_HOME } from "$lib/site/lake-pages";
import type { EntryGenerator, PageServerLoad } from "./$types";

// Plain HTML: these pages have nothing to hydrate, and with no inline
// bootstrap script they share the site CSP instead of needing _headers rules.
export const csr = false;

export const entries: EntryGenerator = () => [...LAKE_PAGES.keys()].map((path) => path.split("/")).filter((parts) => parts.length === 4).map(([, , region, part]) => ({ region: region!, part: part! }));

export const load: PageServerLoad = ({ params }) => {
  const page = LAKE_PAGES.get(`${LAKES_HOME}/${params.region}/${params.part}`);
  if (!page) error(404, "Not found");
  return { lakePage: page };
};
