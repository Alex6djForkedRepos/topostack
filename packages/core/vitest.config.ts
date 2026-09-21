import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      reportsDirectory: "coverage",
      thresholds: { statements: 88, branches: 78, functions: 92, lines: 94 },
    },
  },
});
