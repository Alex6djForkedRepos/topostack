import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The integration test drives core's sheet planner from source, as the generator does.
    alias: { "@topostack/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      thresholds: { statements: 90, branches: 80, functions: 90, lines: 90 },
    },
  },
});
