# Atomm regression review after the performance merge

Date: 2026-09-24. Integrated `origin/dev` at `2288ad4` (PR #113) into the Atomm review branch with merge commit `516784e`. This includes the previously integrated nesting work and the new terrain cache, prepared geometry indexes, parallel annotation workers, cancellation and fallback changes. Release preparation remains deferred to 0.6.0; current versions still match dev at 0.5.0.

## Result

No regression was found in the tested performance, nesting, preview, export, or cancellation paths. The real-platform smoke check exposed one pre-existing numeric-input validity defect; it is corrected and covered by regressions.

A valid dimension such as 300 mm was marked invalid by the browser when min=0.01 and step=0.1, because native step validity anchors increments at min. Embedded inputs now accept arbitrary in-range typed numbers, while explicit arrow-key and drag handling retains the configured increments and bounds. Empty/out-of-range drafts still show inline errors and cannot change geometry. Shift-arrow uses ten increments. Tests cover whole and precise dimensions, ordinary/shift arrows and clamping at both bounds.

## Automated verification

- Full repository `npm test`: 1,419 tests passed before the numeric fix (117 contracts, 75 chart tracing, 5 nesting engine, 350 core, 454 generator unit, 149 generator client, 140 API, 129 script tests).
- After the fix: all 150 generator client tests passed; focused numeric tests passed; workspace type checking and ESLint passed.
- Atomm plus standalone nesting browser suites: 33/33 passed across Chromium, Firefox and WebKit. A new import regression verifies that a nesting-enabled project retains its settings but does not start the sheet planner/WASM or change Atomm exports to nested sheets.
- After the numeric fix: all six focused browser cases passed across the three browsers, covering the platform export/layout flow, native input validity and imported nesting settings.
- Production and Atomm builds, package validation (including SDK/endpoint/site-file/license checks), and both bundle budgets passed. Rebuilt after the numeric fix.
- Version and changelog checks passed; changes remain unreleased fragments.
- Production worker verification passed in Chromium, Firefox and WebKit: custom fonts, cancellation and recovery, cache reuse, helper execution, and serial output parity. Blocking helper-worker requests exercised fallback and preserved exact output within each browser. Cross-engine parity uses the harness’s 1e-8 numerical tolerance.

## Real Atomm Local Debug smoke check

Used the signed-in Atomm console with localhost:4182 serving the production Atomm package and the real platform SDK. Grand Teton terrain loaded at 29 layers. Increasing width from 300.01 to 400 mm produced 38 layers, crossing the parallel threshold. All four geometry helper requests returned 200; no helper fallback or CSP error appeared. Restored width to 300.01 afterwards.

Reloaded the final numeric fix: valid width/height inputs no longer appeared invalid in the browser accessibility tree. Open in Studio reached Atomm’s actual Export Settings dialog, which parsed 610 elements into 170 red-line and 440 blue-line elements.

The known platform account-bootstrap token errors and non-blocking Three.js shadow-map deprecation remain. They did not block the tested terrain/worker/export flow. No new application exception appeared.

## Scope limits

These results do not establish every possible input or device is regression-free. No new timing benchmark or five-minute soak was run; this review validates behavior/output parity, not a quantified browser speedup. Native Studio launch, physical fabrication, production billing, and an uploaded Atomm-hosted release remain untested. No upload, review submission, merge to dev, or version bump was performed. Rebuild the final 0.6.0 artifact through normal release preparation.

## Follow-up: automatic Atomm nesting

The subsequent automatic-nesting change supersedes the earlier exclusion of nested Atomm exports. See [automatic nesting validation](atomm-automatic-nesting-20260924.md) for the new defaults, export color adaptation and verification. The standalone planner UI remains excluded from the embed.
