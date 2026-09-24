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

## Follow-up: export clarity, media and development cleanup

Open in Studio is now described as **1 editable SVG**, with **Entire layout** and its size underneath. Download is described as **Complete project bundle**, with file count/total size secondary and a clearly expandable **View included files** list. The Tips export step uses the same wording and makes clear that material nesting and the assembly guide apply to layered reliefs.

Local performance work was preserved in `28dfad4`, reconciled with the newer merged development implementation in `b33f0a2`, and integrated into this release branch. The remaining contribution on top of remote dev is the terrain-generation guide and its navigation/SEO integration. Local `dev` matches `origin/dev` at `6eb1a32`; this branch includes that complete development base. No version bump or release has been performed.

Refreshed all seven Tips WebPs (960 × 534), eight gallery cards, one still cover and two videos. Images use real terrain and native app renders. The cover video sequences captured canvas states through separation and reassembly; the showcase is a captioned screenshot slideshow. Capture scripts preserve source settings and hashes, and both videos passed full decoding. Visual inspection corrected an empty processing crop and verified the cover movie returns to its assembled state. Historical media and v5 provenance remain in the repository. `npm run package:atomm-listing` verifies hashes, byte counts, image dimensions and platform size/count limits before creating the upload bundle. The version-neutral candidate copy is `atomm/topostack-0.6.0-review-media.zip`.

Combined repository suite: **1,432 tests passed**. After the export wording change, all **616 generator tests** passed; the **150 client tests** were repeated after the final Tips wording update. All **39 Atomm/nesting browser checks** passed across Chromium, Firefox and WebKit. Workspace typechecks, lint, 129 script tests, changelog validation, the full production build, Atomm packaging/artifact verification and both bundle-budget checks passed.

Final real Atomm Local Debug check at `localhost:4182`: the 29-layer Grand Teton project generated and arranged onto four sheets. The panel showed one editable 1.7 MB SVG and a 13-file / 4.6 MB project bundle; expanding the list showed the matching sheet SVGs, master, guide, settings and credits. Visually inspected the panel. Navigated all seven Tips steps: every refreshed image decoded at 960 × 534, the corrected export instructions appeared, and the footer controls remained visible. Existing platform token-bootstrap errors and the existing Three.js shadow-mode warning remained; no new app error was observed. The platform was not uploaded to or submitted for review.

## Media-quality revision

The initial promotional refresh enlarged some cropped model renders and sampled the cover animation at only five source frames per second. Replaced it with nine 3200 × 2400 PNGs, captured at 2× device scale or rendered directly at their presentation resolution. Promotional warning banners are dismissed through the normal UI before every screenshot; capture asserts that no banner text remains. The app's warning behavior is unchanged.

The replacement cover renders 360 distinct frames from the real Three.js scene at 1920 × 1440 / 60 fps. Continuous layer separation and a ±20° camera orbit return to the assembled pose over six seconds. The helper is installed only through capture-session module interception and does not ship in the app. No frame interpolation is used. The 44-second showcase includes native motion at both ends, gently moving feature cards and short fades.

Verified all nine image dimensions, visually inspected every card and sampled motion/scene frames, and confirmed 360 distinct source-frame hashes. Both videos passed full decoding and Chrome playback: 360 frames / 6 seconds and 2,640 frames / 44 seconds, with one browser-dropped frame reported per clip during this local run. Listing packaging passed its hash, size and file-count checks; the largest video is 51,947,792 bytes, below the console's 70 MB limit. Lint passed. This revision changes capture tooling and promotional assets only, so application tests/builds were not repeated.
