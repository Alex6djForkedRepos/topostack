import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * Builds the in-chat MCP App preview (src/mcp-app/) into one self-contained
 * HTML file, dist/mcp-app/terrain-preview.html. Chat hosts render an MCP App
 * from a single document, so the script is inlined rather than linked. The
 * map-api Worker serves the file as the `ui://topostack/terrain-preview.html`
 * resource, filling in its own origin for the map API.
 */
const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

function inlineEntryScript(): Plugin {
  return {
    name: "topostack-inline-entry-script",
    enforce: "post",
    generateBundle(_options, bundle) {
      const html = Object.values(bundle).find((item) => item.type === "asset" && item.fileName.endsWith(".html"));
      if (!html || html.type !== "asset") return;
      let markup = String(html.source);
      for (const [fileName, item] of Object.entries(bundle)) {
        if (item.type !== "chunk") continue;
        const tag = new RegExp(`<script type="module"[^>]*src="[^"]*${fileName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*></script>`);
        if (!tag.test(markup)) throw new Error(`The preview's entry script ${fileName} was not found in its HTML.`);
        // A literal "</script" inside the code would end the inline element early.
        markup = markup.replace(tag, () => `<script type="module">${item.code.replace(/<\/script/gi, "<\\/script")}</script>`);
        delete bundle[fileName];
      }
      html.source = markup;
    },
  };
}

export default defineConfig({
  root: source("./src/mcp-app"),
  base: "./",
  resolve: {
    alias: {
      $lib: source("./src/lib"),
      "@topostack/core": source("../../packages/core/src/index.ts"),
    },
  },
  define: { "import.meta.env.VITE_SITE_ENV": JSON.stringify(process.env.VITE_SITE_ENV ?? "development") },
  plugins: [inlineEntryScript()],
  build: {
    outDir: source("./dist/mcp-app"),
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    modulePreload: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      input: source("./src/mcp-app/terrain-preview.html"),
      output: { codeSplitting: false },
    },
  },
});
