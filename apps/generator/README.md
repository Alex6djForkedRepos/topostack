# @topostack/generator

The SvelteKit site and studio, prerendered as a static site. `src/routes/` holds only pages; everything else lives in one of six layers under `src/lib/` and is imported as `$lib/<layer>/<module>`.

| Layer | Holds | May import |
| --- | --- | --- |
| `lib/domain/` | Terrain, vector, and lake data loading and cleanup, tile math, coordinates, the bundled sample preview, test fixtures | `@topostack/core`, `@topostack/data-contracts` |
| `lib/storage/` | IndexedDB project persistence and parsing | `domain` |
| `lib/workers/` | The geometry Web Worker and its client protocol | `core` |
| `lib/site/` | Marketing pages' shared pieces: SEO metadata, guide index, `Article`, feedback, usage events, theme | `domain` |
| `lib/studio/` | The editor: `App.svelte` owns the state and generation lifecycle; `panels/` holds the sidebar sections, preview panel, and generation dock, which read App state through the `StudioContext` in `studio-context.ts`; previews, dialogs, export flow, project history, global `styles.css` | everything above |
| `lib/atomm/` | The xTool Atomm marketplace embed: alternate shell, SDK bridge, locale, and its stylesheet | `studio`, `site` |

Rules, enforced by ESLint (`no-restricted-imports` in the root config):

- Relative imports are for siblings in the same folder only. Anything in another layer is `$lib/<layer>/...`, so the layer a file depends on is visible in every import.
- Workspace packages are imported by name, never by path.
- Data files outside the app (`scripts/data/*.json`, `static/`, the Worker's terrain test fixture) are the one place a `../` path is allowed.

`src/app.html`, `src/hooks.server.ts`, and the ambient `*.d.ts` files stay at the `src/` root because SvelteKit or the compiler looks for them there.

## Styles

`lib/studio/styles.css` is an index of `@import`s over `lib/studio/styles/*.css`, one file per studio area (shell, sidebar, each section, preview, overlays, export dialog) plus `responsive.css`, which holds every breakpoint. Order matters: equal-specificity rules resolve by position, so new area files go before `responsive.css`. The Atomm embed renders the same markup inside the platform's own design system, vendored as `lib/atomm/atomm-workbench.css`; it is a separate skin, not a copy of the studio styles, and has its own bundle budget.

## Tests

Node tests run with the default Vite config; browser tests are the `*.client.test.ts` files and run under jsdom via `vitest.client.config.ts`. Both are colocated with the code they cover.

## Build modes

`VITE_SITE_ENV` selects `production`, `development`, or `atomm`. The Atomm build injects the platform SDK in `hooks.server.ts` and activates `lib/atomm/`; the studio otherwise renders in the standard shell.
