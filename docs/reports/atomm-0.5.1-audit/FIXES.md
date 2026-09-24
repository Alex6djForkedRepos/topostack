# Atomm review corrections

**Release plan updated:** these fixes now target `dev` for inclusion in 0.6.0 alongside its performance improvements. The 0.5.1 ZIP and audit measurements below are historical validation artifacts, not the next submission. Rebuild and validate the combined release before re-review.

All eight identified code findings have been addressed in the `claude/atomm-hotfix-0.5.1` worktree. The original [review](README.md) is retained as historical evidence. Nothing has been uploaded or published.

| Finding | Correction | Regression evidence |
| --- | --- | --- |
| Export hidden by Tips | Three canvas views (2D / 3D / Export); Edit map area lives in Project setup. Canvas container queries reserve a second toolbar row when needed, including the collapsed title. Map editing scrolls the canvas into view on stacked layouts, and the view switch remains keyboard reachable while Map is active. | Pointer clicks through every view at widths 1280, 960, 700, 390 and 320, both rail states, LTR and RTL. |
| Tips footer clipped | Image and slide body share one shrinking scroll region; header and footer remain outside it. | Every step and Done clicked at 480px and 320px heights; production-style 480px capture shows Next fully inside the dialog. |
| Missing slider fill | Restored filled WebKit tracks, RTL fill direction, Firefox progress, and disabled states. | Visual inspection of the corrected layer slider; existing range interaction tests retained across browsers. |
| Font popup contract | Native select in the embed; the standalone sample picker remains available in the full studio. | Native SELECT, eleven options, 110×28 dimensions, and a real font change checked in browser tests. |
| Silent numeric clamping | Invalid typing remains visible with an associated inline error. It does not update geometry; correction clears the error. Drag and keyboard steps remain bounded and synchronize the displayed value. | Component tests cover above/below limits, blank input, blur, callbacks and descriptions. Browser test verifies an invalid width preserves the last valid export. |
| Camera resets | Rebuilds update the Fit target without moving the user's camera or orbit target. Initial load and explicit Fit still frame the model; constraints preserve the current camera distance. | Camera and target checked across simultaneous dimension, thickness and layer-count changes. |
| Misleading operation legend | Legend derives cut strokes, score strokes and filled engraving from the actual master SVG. | Selecting a filled font produces the Blue fill · Engrave legend; canonical machine-facing SVG colors retained. |
| Inaccurate download sizes | Preview packaging loads the same cached guide fonts and options as Download. Failed preview packaging clears obsolete output. | Actual exported file bytes compared with the preview's total. |

## Additional rendering and accessibility improvements

The persistent 3D rig now provides the recommended subtle idle sway and drag-release spring. It never changes fabrication geometry or the camera. Idle rendering is rate-limited and pauses while users operate controls, including when a control disappears after an edit; focusing or interacting with the 3D canvas resumes it. Camera gestures and geometry updates request immediate renders. Shadow maps refresh when geometry or layer separation changes, rather than on every ambient frame.

Reduced motion turns off rig motion and orbit damping. Hidden tabs stop rendering. Tests cover keeping the same rig through rebuilds, pausing without resetting its pose, reduced-motion quiescence, hidden-tab recovery, and zero-size → visible resize with camera projection and renderer size updated together. Placement easing is capped at 200ms. The embedded progress display uses stage text/counts without the inherited looping contour animation.

## Visual evidence

- [960px controls and filled slider](fixed-controls-960.png)
- [Collapsed lead rail](fixed-controls-collapsed.png)
- [Tips in a 480px-high frame](fixed-tips-480.png)
- [Short-frame bounds](fixed-short-frame-measurements.txt)

## Verification

- Generator suites: 425 unit tests and 143 client tests passed. The final camera/rendering refinement also passed all 10 focused preview lifecycle tests.
- Browser regression: all 27 tests passed across Chromium, Firefox and WebKit.
- Workspace type checking, ESLint, and `git diff --check` passed. Svelte reported zero errors and zero warnings.
- Standalone production build and Atomm package build passed, including both web budget checks and the package validation gates.
- Five-minute Chromium stability run: 339 geometry edits, no browser errors, 9 live textures and 5 programs throughout; live buffers settled between 25 and 36 after startup. Post-GC heap ended at 13.73 MB and remained around 13.6–13.8 MB in the last two minutes. Reduced motion stopped idle rendering. This bounded run supports stability; it is not a proof against every possible leak. See [raw measurements](soak-results.json) and [final frame](soak-final.png).

## Rebuilt submission artifact

The submission archive is `apps/generator/topostack-atomm-v0.5.1.zip`. Its adjacent `.zip.sha256` and `.release.json` files identify the exact checksum, size, source commit, working-tree state, and production API dataset for each build. These generated artifacts are not checked into Git. The final submission package is rebuilt after committing the corrections so it identifies a clean source revision.

## Remaining platform validation

The subsequent [authenticated Local Debug validation](CONSOLE-VALIDATION.md) exercised the real SDK, live terrain APIs, Download hook, and actual Open in Studio processing dialog successfully. Native Studio launch, production billing, and Atomm-hosted artifact behavior remain unverified. This evidence does not establish platform approval or an exhaustive accessibility certification.

## Legend spacing follow-up

Added a 24px horizontal gap between operation labels, retaining an 8px gap when rows wrap. Rebuilt the ZIP and release checksum after this CSS change; client tests, lint, Svelte checks, and web budgets passed.

## Refresh progress follow-up

The refresh chip now exposes the actual stage and count: Step 1 of 2 while preparing source data, then Step 2 of 2 while building geometry. There is no spinner or looping animation, consistent with the Atomm motion guide. Verified visible stage text and absence of the spinner in Chromium using the built CSS. All 143 client tests, lint, Svelte checks, build and budgets passed. ZIP and checksum regenerated.

## Integration with dev for 0.6.0

Integrated dev through `907faaf`, preserving sheet nesting and third-party license output in the standalone app. The Atomm embed does not start the sheet planner or pass a nested plan to its export hook. Removed standalone 0.5.1 release preparation; versions match dev (0.5.0), with unreleased changelog fragments for the normal release workflow. PR #107 now targets dev.

Integrated validation passed: 444 generator unit tests, 149 client tests, all 27 Atomm browser checks across Chromium/Firefox/WebKit, workspace type checking, ESLint, version/changelog checks, standalone production build and budget, and dedicated Atomm packaging with its validation gates and budget. The packaging run uses dev’s current version and is validation-only; rebuild the final 0.6.0 submission after its remaining improvements land.
