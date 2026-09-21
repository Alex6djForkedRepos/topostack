import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  resolve: { conditions: ["browser"] },
  test: {
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "http://localhost/" } },
    include: ["src/lib/**/*.client.test.ts"],
    testTimeout: 20_000,
    coverage: {
      reportsDirectory: "coverage/client",
      thresholds: { statements: 60, branches: 40, functions: 65, lines: 50 },
    },
  },
});
