import { PUBLISHED_EXAMPLES } from "$lib/site/examples.server";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () => ({
  examples: PUBLISHED_EXAMPLES.map(({ slug, place, region, summary, shape, capture }) => ({ slug, place, region, summary, shape, layers: capture.layers, image: capture.image })),
});
