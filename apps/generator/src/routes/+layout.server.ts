import { pageSeo } from "$lib/site/seo";
import type { LayoutServerLoad } from "./$types";

// Head metadata resolves at prerender time so the page registry never ships to the browser.
export const load: LayoutServerLoad = ({ url }) => ({ seo: pageSeo(url.pathname.replace(/\/$/, "") || "/") });
