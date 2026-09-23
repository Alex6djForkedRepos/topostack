import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.svelte-kit/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/test-results-live/**",
      ".topostack/**",
      ".terrain-venv/**",
      ".venv-data/**",
      ".claude/worktrees/**",
      "**/src/worker-configuration.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["apps/generator/vitest.config.ts", "apps/generator/vitest.client.config.ts", "packages/chart-trace/vitest.config.ts", "packages/core/vitest.config.ts", "packages/data-contracts/vitest.config.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Rune modules (*.svelte.ts) are parsed by the Svelte parser too, and it
    // needs the TypeScript parser handed to it to read their types.
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser },
    },
    // These checks conflict with intentional imperative canvas/WebGL setup and
    // stable index-rendered geometry lists; Svelte and TypeScript checks still
    // cover the surrounding component code.
    rules: {
      "svelte/no-dom-manipulating": "off",
      "svelte/no-navigation-without-resolve": "off",
      "svelte/prefer-svelte-reactivity": "off",
      "svelte/require-each-key": "off",
    },
  },
  {
    files: ["**/*.mjs", "**/*.config.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    // Workspace packages are consumed by name. Reaching into another
    // package's src/ bypasses its exports map and hides the dependency graph.
    files: ["**/*.ts", "**/*.mjs", "**/*.svelte"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["**/packages/*/src/**", "**/packages/*/src"], message: "Import workspace packages by name (@topostack/core, @topostack/data-contracts/<module>), not by path." }],
      }],
    },
  },
  {
    // Inside the generator, modules live in src/lib/<layer>/ and are imported
    // as $lib/<layer>/<module>. Relative imports may only point at siblings so
    // a file's layer is visible in every import that reaches it.
    files: ["apps/generator/src/**/*.ts", "apps/generator/src/**/*.svelte"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/packages/*/src/**", "**/packages/*/src"], message: "Import workspace packages by name (@topostack/core, @topostack/data-contracts/<module>), not by path." },
          {
            // Only static data, shared catalogs, the release changelog, and the
            // terrain test fixture may cross a parent directory; all app
            // modules use $lib aliases.
            regex: String.raw`^(?!(?:\.\./){3,4}static/|(?:\.\./){5}scripts/data/|(?:\.\./){5}changelog/|(?:\.\./){5}workers/map-api/test/terrain-fixture$)(?:\./)*\.\.(?:/|$)`,
            message: "Import other generator modules as $lib/<layer>/<module>; relative imports are for siblings only.",
          },
        ],
      }],
    },
  },
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
);
