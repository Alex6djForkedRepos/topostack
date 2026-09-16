import directory from "../../../static/data/lake-depth-directory.json";
import noaa from "../../../../../scripts/data/noaa-great-lakes.json";
import type { PageServerLoad } from "./$types";

// Only source metadata reaches the page; the full lake index stays out of its payload.
export const load: PageServerLoad = () => ({
  surveySources: directory.sources,
  updated: directory.updated,
  noaaCitations: noaa.lakes.flatMap((lake) => lake.doi ? [{ name: lake.names[0], url: `https://doi.org/${lake.doi}` }] : []),
});
