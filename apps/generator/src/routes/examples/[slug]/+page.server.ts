import { error } from "@sveltejs/kit";
import { PUBLISHED_EXAMPLES } from "$lib/site/examples.server";
import type { EntryGenerator, PageServerLoad } from "./$types";

export const entries: EntryGenerator = () => PUBLISHED_EXAMPLES.map((example) => ({ slug: example.slug }));

export const load: PageServerLoad = ({ params }) => {
  const example = PUBLISHED_EXAMPLES.find((entry) => entry.slug === params.slug);
  if (!example) error(404, "Not found");
  const others = PUBLISHED_EXAMPLES.filter((entry) => entry.slug !== example.slug).map(({ slug, place }) => ({ slug, place }));
  return { example, others };
};
