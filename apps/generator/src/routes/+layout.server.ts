import { pageSeo } from "$lib/site/seo";
import { lakePageSeo } from "$lib/site/lake-pages";
import { LAKE_PAGES, LAKE_PLACES } from "$lib/site/lake-pages.server";
import { lakePlaceSeo, type LakePlace } from "$lib/site/lake-places";
import { DEFAULT_SOCIAL_IMAGE } from "$lib/site/site";
import { examplePageSeo } from "$lib/site/examples";
import { PUBLISHED_EXAMPLES } from "$lib/site/examples.server";
import type { LayoutServerLoad } from "./$types";

// A lake's page shares the sharing card of the region list that names it.
function placeSeo(place: LakePlace) {
  const region = LAKE_PAGES.get(place.trail[1]!.path);
  return lakePlaceSeo(place, region ? lakePageSeo(region).image : DEFAULT_SOCIAL_IMAGE);
}

// Head metadata resolves at prerender time so the page registries never ship to the browser.
export const load: LayoutServerLoad = ({ url }) => {
  const path = url.pathname.replace(/\/$/, "") || "/";
  const lakePage = LAKE_PAGES.get(path);
  const lakePlace = LAKE_PLACES.get(path);
  const example = PUBLISHED_EXAMPLES.find((entry) => `/examples/${entry.slug}` === path);
  return { seo: pageSeo(path) ?? (lakePage ? lakePageSeo(lakePage) : lakePlace ? placeSeo(lakePlace) : example ? examplePageSeo(example) : undefined) };
};
