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
        projectService: { allowDefaultProject: ["apps/generator/vitest.client.config.ts"] },
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
    files: ["**/*.svelte"],
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
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },
);
