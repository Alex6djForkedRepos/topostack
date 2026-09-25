import { readFileSync } from "node:fs";
import { PUBLIC_PAGES, headline, isArticlePage, socialImage } from "../../apps/generator/src/lib/site/seo.ts";
import { buildLakePages, lakePageSeo } from "../../apps/generator/src/lib/site/lake-pages.ts";
import { EXAMPLES, exampleImage, exampleMeta, examplePath } from "../../apps/generator/src/lib/site/examples.ts";

/**
 * Every indexable page the site should publish, with what the verifiers check:
 * the recorded content date, the sharing card, and article metadata where the
 * page is a dated article. Registered pages, generated lake pages and examples.
 */
export function expectedPages() {
  const pages = new Map();
  for (const [path, meta] of Object.entries(PUBLIC_PAGES)) {
    pages.set(path, { updated: meta.updated, image: socialImage(path), ...(isArticlePage(path) ? { article: { headline: headline(meta.title), published: meta.published, updated: meta.updated } } : {}) });
  }
  const directory = JSON.parse(readFileSync(new URL("../../apps/generator/static/data/lake-depth-directory.json", import.meta.url), "utf8"));
  for (const page of buildLakePages(directory).pages.values()) pages.set(page.path, { updated: page.updated, image: lakePageSeo(page).image, lake: true });
  for (const example of EXAMPLES) {
    pages.set(examplePath(example.slug), { updated: example.updated, image: exampleImage(example), article: { headline: headline(exampleMeta(example).title), published: example.published, updated: example.updated } });
  }
  return pages;
}
