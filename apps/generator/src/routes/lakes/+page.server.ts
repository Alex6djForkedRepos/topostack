import { LAKE_PAGES, LAKE_REGIONS } from "$lib/site/lake-pages.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => ({
  regions: LAKE_REGIONS.map((region) => ({ ...region, largest: LAKE_PAGES.get(region.path)!.largest })),
});
