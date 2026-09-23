# TopoStack: working notes for agents

Browser terrain studio for laser-cut reliefs and engravings. Read [docs/architecture.md](docs/architecture.md) first; it states the one geometry flow, the coordinate conventions, and the invariants that tests protect. [docs/README.md](docs/README.md) indexes every other document.

## Commands

```bash
npm run dev          # generator + map-api Worker together
npm run typecheck    # every workspace (svelte-check for the generator)
npm run lint         # eslint, zero warnings allowed; enforces the import rules below
npm test             # unit tests for every workspace plus the script tests
npm run test:coverage
npm run build && npm run budget:web   # the enforced bundle budgets in scripts/build/check-web-budget.mjs must pass
npm run test:e2e     # Playwright against the built app (CI runs three browsers)
```

Run generator tests from `apps/generator` or via `npm run test -w @topostack/generator`; running vitest from the repo root with `--root` breaks `$lib` resolution.

## Where a change goes

| Change | Place |
| --- | --- |
| Geometry, contours, stack planning, nesting, water depth, labels, SVG output | `packages/core/src/<cluster>/` (see the folder table in the architecture doc); export new entry points from `index.ts` explicitly |
| A contract the browser, Worker, and scripts all read (catalog shape, archive release, terrain PNG codec, usage events) | `packages/data-contracts/src/`, one subpath export per module |
| Turning a depth chart image into bathymetry (georeferencing, gridding, tracing) | `packages/chart-trace/src/`, one subpath export per module; relative imports use `.ts` so Node runs it unbuilt |
| The sheet-nesting solver (sparrow compiled to WebAssembly) | `packages/nest-wasm/`: Rust shim in `src/*.rs`, TypeScript wrapper in `src/index.ts`; rebuild the committed `pkg/` with `npm run build:nest-wasm` (see its README) |
| Data loading, tile math, coordinates, cleanup | `apps/generator/src/lib/domain/` |
| IndexedDB persistence | `apps/generator/src/lib/storage/` |
| Geometry worker or its protocol | `apps/generator/src/lib/workers/` |
| Homepage, guides, SEO, feedback | `apps/generator/src/lib/site/` and `src/routes/` |
| Studio state and generation lifecycle | `apps/generator/src/lib/studio/App.svelte`; panels read it through `studio-context.ts` |
| A sidebar section, dialog, or preview element | `apps/generator/src/lib/studio/panels/` |
| Studio CSS | `apps/generator/src/lib/studio/styles/<area>.css`, imported in cascade order by `styles.css` |
| Atomm embed behavior | `apps/generator/src/lib/atomm/`; the platform's stylesheet there is vendored, not ours |
| Serving, caching, geocoding | `workers/map-api/src/routes/` |
| An operational script | `scripts/<purpose>/` and a row in `scripts/README.md` saying how it runs |
| A design decision or runbook | `docs/`, then a line in `docs/README.md` |
| What users will notice about a change | a fragment in `changelog/unreleased/` (`npm run changelog:new`); see [docs/changelog.md](docs/changelog.md) |

## Rules the linter and CI enforce

- Import workspace packages by name (`@topostack/core`, `@topostack/data-contracts/<module>`). Paths into another package's `src/` are rejected.
- Inside the generator, cross-layer imports are `$lib/<layer>/<module>`; relative imports are for siblings only.
- `@topostack/core` has no Svelte, Atomm, Cloudflare, DOM, or storage imports. The Worker never generates contours.
- Bundle budgets guard what a visitor waits for (homepage, studio first paint, default preview) with about 10% headroom; totals across every route are reported, not enforced. If a budget fails, first check the change did not pull something onto a critical path; if the growth is real, raise the budget in the same PR and give the measured number in the description.
- `ProjectConfigV1`, `SourceBundleV1`, `GeometryIRV1`, and the export manifest are versioned; an incompatible change needs a migration, never a silent reinterpretation.
- Tests sit beside the code they cover. Coverage thresholds live in each workspace's `vitest.config.ts`, not in npm scripts.
- Pull requests target `dev`; releases are promoted to `main`.
- A pull request users will notice adds a `changelog/unreleased/` fragment written for makers; others are labelled `no-changelog`. Versions change only through `changelog:prepare`, which the promotion workflow runs.

## Verifying a change

Typecheck, lint, and the affected workspace's tests before a PR. For anything that changes what the studio renders, run the generator client tests (they mount the whole app) and the build plus budget. For core geometry, `fabrication-regressions.test.ts` and the cluster tests next to the module are the regression net. State what you ran and what you did not.
