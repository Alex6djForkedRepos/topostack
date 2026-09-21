import { groupEntries, releaseViews, unreleasedEntries } from "$lib/site/changelog.server";
import type { PageServerLoad } from "./$types";

// Pending fragments are shown on development builds only, so the dev site
// previews the wording before a release folds them in.
export const load: PageServerLoad = () => ({
  releases: releaseViews(),
  unreleased: import.meta.env.VITE_SITE_ENV === "development" ? groupEntries(unreleasedEntries()) : [],
});
