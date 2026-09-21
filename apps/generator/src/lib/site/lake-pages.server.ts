import directory from "../../../static/data/lake-depth-directory.json";
import type { LakeDirectory } from "$lib/site/lake-directory";
import { buildLakePages } from "$lib/site/lake-pages";

// Built once per prerender from the same file the directory search downloads.
export const { pages: LAKE_PAGES, regions: LAKE_REGIONS } = buildLakePages(directory as LakeDirectory);
