# @topostack/core

The portable geometry engine: project validation, contour tracing, stack planning, material nesting, water depth, labels, and the SVG fabrication package. No Svelte, DOM, Cloudflare, Atomm, or storage imports; the generator runs it in a Web Worker and Node scripts import its built `dist/`.

`src/` is grouped by concern (`primitives/`, `water/`, `annotate/`, `pipeline/`, `export/`, `project/`), with tests beside the modules they cover and shared fixtures in `test-support/`. The folder table and the import order between them are in [docs/architecture.md](../../docs/architecture.md#core-package-layout). `index.ts` names every public entry point; consumers import `@topostack/core` and never reach into `src/`. `@topostack/core/project` exports only the project reader, crop bounds, agent request contract and stack planning, for callers such as the map-api Worker that must not pull in contour generation.

```bash
npm run test -w @topostack/core
npm run coverage -w @topostack/core   # thresholds in vitest.config.ts
npm run build -w @topostack/core      # cleans and emits dist/ for Node consumers
```
