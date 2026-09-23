# Depth chart readiness review — 2026-09-23

The browser workflow is functional end to end after this refinement. Tested on the local `codex/custom-data-ux` branch based on `dev` at `d303331`; changes have not been deployed. Chart interpretation still requires the maker to inspect the traced result. This review does not certify arbitrary scanned charts or the accuracy of their underlying depth data.

## Verified workflows

- Live production API search found Crater Lake and loaded its outline.
- PNG upload, placement of two contour depths, real Web Worker tracing, preview, saving to IndexedDB, selecting the chart for a lake, reloading the page, and stopping use.
- Project settings export contains the chart record and the matching project reference. Existing storage tests cover importing referenced chart data.
- Corrupt PDF recovery, a blank PDF cover followed by selecting the chart page, real pdf.js rendering, tracing the selected page, and 390px-wide layouts.
- The new browser suite passes in Chromium, Firefox, and WebKit: two workflows per engine, six tests total. External lake responses are deterministic fixtures; tracing, PDF rendering, storage, UI interactions, and project export are real.
- A separate manual live-data check used a synthetic contour image shaped to Crater Lake's actual outline. The trace reported 100% contour coverage and 99% shoreline fit. Saving, selecting it, and generating against the live terrain API produced **10 layers and 7 cut panels**, with **Ready to export**. The preview correctly reported chart-derived lake floors and incomplete chart-grid coverage using fallback depths. The synthetic image is test data, not a depth survey.

## Fixes and refinements

- Late uploads and trace completions cannot overwrite newer chart work or clear a newer operation's busy state.
- Library-loading failures surface an actionable error and retry control rather than an unhandled rejection or a misleading empty library.
- Elevation charts accept negative elevations; tracing validates surface elevation and contour interval before starting.
- Failed PDF opening releases its loading task.
- Numbered steps, upload preparation guidance, contour interval help, and clearer saved-chart status explain the workflow.
- A depth-entry field, Undo last point, and Trace chart sit beside the image. Completed results scroll into view, show a depth legend, and offer Review and save chart, which focuses the save section.
- Custom data disclosures collapse independently of the active workspace; collapsing preserves the map/chart and provides Show tools to reopen controls.

## Validation

- Generator unit suite: 363 passing tests.
- Generator client suite: 113 passing tests, followed by a passing focused rerun with the additional asynchronous-operation regression (114 client tests in total).
- Chart tracing engine: 74 passing tests.
- Core bathymetry integration: 20 passing tests.
- Browser workflows: 6 passing tests across three browser engines.
- Repository typecheck, ESLint, production generator build, bundle budgets, and diff whitespace checks passed.

Run the new browser tests with `npx playwright test e2e/depth-charts.spec.ts --workers=2`.

## Practical limits

- The automated raster/PDF fixtures use clean, synthetic contours. The live integration check also uses synthetic depths. A representative set of real customer scans, photographs, coloured charts, dense labels, and irregular shorelines has not been evaluated in this review.
- Crop source images to the lake and contours before uploading. The current UI has no in-app crop or ink-colour selector, although the engine supports those inputs. Poor contrast, page frames, legends, and obstructing labels may need preparation outside the app.
- The library and unfinished work are browser-local. Saved charts travel in project files; unfinished chart drafts do not survive a full page reload. Share links do not carry chart data.
- Password-protected PDFs and PDF images requiring unavailable decoders need conversion to PNG/JPEG. Errors give recovery guidance.
- Atomm's embedded depth-chart presentation was not separately reviewed.

The implementation is ready for product review and normal clean-chart use. Broad claims about automatic tracing quality should wait for evaluation against representative real charts.
