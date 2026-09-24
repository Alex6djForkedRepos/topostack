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
