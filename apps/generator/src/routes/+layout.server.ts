import { pageSeo } from "$lib/site/seo";
import { lakePageSeo } from "$lib/site/lake-pages";
import { LAKE_PAGES } from "$lib/site/lake-pages.server";
import { examplePageSeo } from "$lib/site/examples";
import { PUBLISHED_EXAMPLES } from "$lib/site/examples.server";
import type { LayoutServerLoad } from "./$types";

// Head metadata resolves at prerender time so the page registries never ship to the browser.
export const load: LayoutServerLoad = ({ url }) => {
  const path = url.pathname.replace(/\/$/, "") || "/";
  const lakePage = LAKE_PAGES.get(path);
  const example = PUBLISHED_EXAMPLES.find((entry) => `/examples/${entry.slug}` === path);
  return { seo: pageSeo(path) ?? (lakePage ? lakePageSeo(lakePage) : example ? examplePageSeo(example) : undefined) };
};
