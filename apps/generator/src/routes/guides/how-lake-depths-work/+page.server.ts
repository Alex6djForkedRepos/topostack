import directory from "../../../../static/data/lake-depth-directory.json";
import type { PageServerLoad } from "./$types";

// Share the directory's source list without shipping its full lake index.
export const load: PageServerLoad = () => ({
  sources: directory.sources.map(({ id, name, url, kind, region }) => ({ id, name, url, kind, region })),
});
