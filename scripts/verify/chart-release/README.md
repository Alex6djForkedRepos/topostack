# First-release reviewed chart verification

Run from the repository root with installed workspace dependencies and Node 26. The public-domain source geometry, manual correction notes, source hash, and calibration are frozen in `king-city-reviewed.json`.

```sh
node scripts/verify/chart-release/verify.mjs
npx playwright test e2e/depth-charts.spec.ts --workers=2
```

The offline check builds the reviewed source geometry, verifies exact depth values and no inference, rejects an unconfirmed contour, and ensures no layer-review receipt is granted by generation. Browser tests exercise both raster correction and native PDF preparation across three engines.

For real-source captures, first fetch/hash-check and render the inputs using [the accuracy probe](../chart-accuracy/README.md). Start the local Vite server with real map access:

```sh
VITE_MAP_API_URL=https://topostack.app npm run dev -w @topostack/generator -- --host 127.0.0.1 --port 5278
node scripts/verify/chart-release/capture.mjs
node scripts/verify/chart-release/generate.mjs
.terrain-venv/bin/python scripts/verify/chart-release/score.py
```

Captures use isolated Chromium storage. `capture.mjs` fixes the map lake input, uploads the real source crop, imports an explicitly prepared review draft, checks alignment/layer gates, and saves/exports the project. `generate.mjs` imports that project into fresh storage and runs actual terrain generation. It records coverage/provenance warnings rather than suppressing them. Downloads and intermediate records remain in ignored `.topostack/`; screenshots are written to `docs/images/chart-release/`.

Independent QA scoring uses `score()` in `../chart-accuracy/evaluate.py`, the generated `.topostack/chart-release/king-reviewed-record.json` record, and `.topostack/chart-accuracy/king-city-qa.npy`. It must remain separate from construction of the review fixture. Read the [release report](../../../docs/reports/chart-first-release-2026-09-23.md) before interpreting the results.
