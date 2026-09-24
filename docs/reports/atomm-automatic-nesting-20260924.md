# Automatic Atomm export nesting

Date: 2026-09-24. Follow-up to the performance integration on PR #107, targeting dev for the planned 0.6.0 release.

## Behavior

Layered Atomm exports automatically arrange pieces using sparrow, with no nesting controls added to the embed. Export Preview, Download and Open in Studio share one cached layout per geometry/settings combination. Defaults are 600 × 400 mm sheets (existing work-area dimensions take precedence), 3 mm margins, 2 mm spacing, quarter-turn rotation, seed 1 and a five-second search. An eight-second watchdog stops at the best complete draft. Nothing is scaled. The stock dimensions are layout defaults, not a detected machine bed.

The preview shows actual arrangement/package stages and the resulting sheet count/dimensions. Engravings bypass nesting. Changed designs cancel obsolete searches; changes during arrangement prevent stale export. Oversize parts, invalid jobs and failed workers retain the original panels with an explicit explanation. Imported advanced nesting settings do not alter automatic defaults. The source project stays unchanged and the downloaded manifest records the effective settings.

Nested assembly labels would otherwise introduce a green processing group requiring a manual choice in Atomm. Embedded SVGs and their guide/readme therefore use standard Atomm blue for these labels. Geometry and transforms remain byte-identical apart from that color; standalone exports retain green. This uses the documented [SVG color specification](https://dev.atomm.com/docs/export/svg-color-spec) and [asynchronous export lifecycle](https://dev.atomm.com/docs/export).

## Verification

Generator unit tests: 464 passed. Generator client tests: 150 passed. Coverage includes shared layout caching, default dimensions, immutable imported settings, cancellation during worker/import work, bounded search, fallback, async bridge disconnects and exact SVG geometry preservation during color adaptation.

All 36 Atomm/standalone nesting browser tests passed across Chromium, Firefox and WebKit. They cover actual nested file manifests, shared preview/export output, worker failure fallback, responsive controls/Tips, flat engraving and the standalone planner. Workspace typechecks, lint and changelog validation passed. Production and Atomm builds, the Atomm artifact verifier and both bundle-budget checks passed. The Atomm build used `VITE_MAP_API_URL=https://topostack.app`, matching the release workflow. The generated 0.5.0 ZIP is a validation artifact only; release preparation remains deferred to 0.6.0.

Real Atomm Local Debug (`localhost:4182`): the 29-layer Grand Teton/Jenny Lake design arranged onto four 600 × 400 mm sheets; Export Preview showed 13 download files, 4.6 MB total and a 1.7 MB master. The real SDK Open in Studio dialog parsed 645 elements into exactly two groups: 170 red cuts and 475 blue line engravings, with no extra green/manual group. Visually checked the nested preview, layout note and separated legend. Closed the dialog without launching native Studio.

## Limits

This validates the exercised designs and browsers, not globally optimal packing or every possible input. Physical fabrication, native Studio launch, production credit billing and uploaded-host behavior are outside this check. No version bump, merge, review submission or upload is performed; rebuild the final 0.6.0 artifact during release preparation.

## Follow-up: material size and live progress

The Export view now exposes only material width and height in the right rail. They persist using the existing project sheet settings; imported dimensions are honored. Unset dimensions still use the work area or 600 × 400 mm defaults. Spacing, margins, rotations and search time remain automatic. This supersedes the initial policy of ignoring imported sheet dimensions.

Terrain and sheet arrangement share a progress-card component. Actual worker drafts appear as sheet outlines with sheet count, utilization and layout update count. The user may keep a complete current layout early. Stage 2 prepares the final artwork and package. Material edits cancel obsolete searches, update the layout without regenerating terrain, and reject invalid numeric drafts. Progress uses real stages/counts rather than a simulated percentage or looping animation.

Follow-up generator tests: 466 unit tests and 150 client tests passed, including stale draft suppression, early stop, and material-only search replacement.

All 39 browser checks passed across Chromium, Firefox and WebKit. The new workflow test observes draft outlines, stage/count progress without looping motion, early completion, invalid-size rejection, material-only updates without another geometry worker, and saved dimensions after reload. Workspace types/lint, production and Atomm builds, artifact verification and both bundle budgets passed.

Final Local Debug verification in the real Atomm host showed draft layouts 1 and 2 for the 29-layer Grand Teton design, the shared progress card, sheet count/utilization, and the early-finish control. Changing material width from 600 to 700 mm restarted nesting while terrain remained at 29 layers / 23 panels. The material-size edit was undone after testing. The final package still uses the existing release version as a validation artifact, pending 0.6.0 release preparation.
