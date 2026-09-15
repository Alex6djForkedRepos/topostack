import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

// Vite's own 5173 collides with just about every other JS dev server, so the
// generator claims a quieter default. TOPOSTACK_WEB_PORT overrides it, and the
// root `npm run dev` sets that variable when it has to move off the default.
const siteEnvironment = process.env.VITE_SITE_ENV ?? "development";
if (!["production", "development", "atomm"].includes(siteEnvironment)) throw new Error("VITE_SITE_ENV must be production, development, or atomm.");
const DEFAULT_WEB_PORT = 5273;
const requestedWebPort = Number(process.env.TOPOSTACK_WEB_PORT);
const webPort = Number.isInteger(requestedWebPort) && requestedWebPort > 0 && requestedWebPort <= 65_535 ? requestedWebPort : DEFAULT_WEB_PORT;

export default defineConfig({
  plugins: [sveltekit()],
  // Keep Vite and the post-build header policy on the same explicit environment.
  define: { "import.meta.env.VITE_SITE_ENV": JSON.stringify(siteEnvironment) },
  server: { port: webPort, strictPort: true },
  build: {
    target: "es2022",
    sourcemap: false,
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("node_modules/maplibre-gl")) return "maplibre";
          if (id.includes("node_modules/@lucide/svelte") || id.includes("node_modules/svelte") || id.includes("node_modules/bits-ui")) return "ui";
          return undefined;
        },
      },
    },
  },
});
