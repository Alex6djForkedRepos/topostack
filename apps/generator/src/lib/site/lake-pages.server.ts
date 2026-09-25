import directory from "../../../static/data/lake-depth-directory.json";
import lock from "$lib/site/lake-slugs.json";
import type { LakeDirectory } from "$lib/site/lake-directory";
import { buildLakePages } from "$lib/site/lake-pages";
import { LAKE_PLACE_HOME, buildLakePlaces, lakePlaceSlugs } from "$lib/site/lake-places";

// Built once per prerender from the same file the directory search downloads.
const slugs = lakePlaceSlugs(directory as LakeDirectory, lock);
const built = buildLakePages(directory as LakeDirectory, slugs);
export const { pages: LAKE_PAGES, regions: LAKE_REGIONS } = built;
/** One page per substantial named lake, keyed by path (/lake/<slug>). */
export const LAKE_PLACES = buildLakePlaces(directory as LakeDirectory, slugs, built.trails);

/** What /data/lake-pages.json serves: lake id → page slug, for every lake with a page. */
export function lakePageIndex(): { schemaVersion: 1; pages: Record<string, string> } {
  return { schemaVersion: 1, pages: Object.fromEntries([...LAKE_PLACES.values()].map((place) => [place.id, place.path.slice(LAKE_PLACE_HOME.length + 1)])) };
}
