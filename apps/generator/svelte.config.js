import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

// The Atomm package is the studio alone: its entry page, the studio route and
// the credits page the studio links to. Crawling would pull in the whole
// public site (guides, lake pages, examples), which the platform never shows.
const atommBuild = process.env.VITE_SITE_ENV === "atomm";

/** @type {import("@sveltejs/kit").Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ pages: "dist", assets: "dist", strict: true }),
    alias: {
      "@topostack/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
    paths: { relative: true },
    ...(atommBuild ? { prerender: { crawl: false, entries: ["/", "/studio", "/attribution"], handleUnseenRoutes: "ignore" } } : {}),
  },
};

export default config;
