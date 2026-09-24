# Reviewed depth charts: first release candidate

Implemented September 23, 2026. This is a locally validated release candidate, not a deployed release or a physical fabrication certificate. The [implementation plan](../plans/depth-chart-first-release.md) follows the [earlier broad accuracy trial](chart-tracing-accuracy-2026-09-23.md), which did not support unattended raster tracing.

## Supported workflow

The first profile supports flat, geographically referenced, single-lake charts with complete closed contours. Islands, underwater rises, crossing contours, incomplete charts, and perspective photographs are outside this profile.

1. Select the lake and upload the original image or PDF page. Set units, depth versus elevation, surface elevation when applicable, and a positive contour interval.
2. For a vector PDF, select the line styles that contain contours. Otherwise mark printed values on at least three raster paths. **Prepare contours** proposes geometry; it does not generate depths.
3. Inspect the source overlay. Assign each included path its printed value, select the source shoreline, and confirm each path. Exclude legend fragments and land contours. Join or close legitimate gaps, edit vertices, or redraw paths as needed. Undo/redo is available. Re-preparing replaces edits.
4. Place at least four geographically distributed control points and enter their longitude/latitude from the source. Inspect the dashed map outline and explicitly confirm alignment. The affine fit rejects excessive residuals or poor shoreline overlap.
5. Resolve all reported issues, then generate reviewed depths. Review the basin, representative stacked layers, and flat depth preview against the source. Confirm that review before keeping the chart.
6. Apply the saved chart, generate terrain, and inspect the actual project cut layers and any coverage warnings. Representative chart preview layers are not the final project toolpaths.

Export a review draft before leaving unfinished work. To restore it, upload the same original file and page, then restore the draft. Restoration requires fresh alignment confirmation and regeneration. Changes invalidate previous generated output and layer approval.

The review receipt survives project export/import. Legacy records remain recoverable/exportable, but unreviewed user charts cannot be applied to new terrain generations. The receipt records completion of review, not surveyed accuracy. `publishable` means license eligibility only.

## Guardrails and verification

Generation rejects unconfirmed paths, missing values or shoreline, open paths, self-intersections, crossings, invalid contour intervals, unsupported depth ordering, and paths outside the source shoreline. Geometry and comparison limits bound expensive validation. Alignment requires at least four distributed points, no individual residual above 20 m, and shoreline intersection-over-union of at least 0.8. These are workflow guards, not fabrication tolerances; a good fit can still have an incorrect datum or source coordinate interpretation.

- 749 unit/component checks passed: generator 419 node + 139 client, tracing 75, contracts 116.
- 15 browser workflow checks passed across Chromium, Firefox, and WebKit, including mobile layout, editing, undo/redo, draft restore, save gating, and export/import persistence. This includes three native PDF checks that extract the three source rings without raster marks and retain the review gate.
- Workspace type checking passed with zero Svelte errors/warnings. Production browser-test build passed.
- The updated real-chart stress probe stops King City's unreviewed raster proposal at mandatory contour review without creating a depth grid.

## Real source results

The checked-in [King City reviewed fixture](../../scripts/verify/chart-release/king-city-reviewed.json) comes from the public-domain [USGS SIM 3486 sheet 2](https://pubs.usgs.gov/sim/3486/sim3486_sheet02.pdf). PDF SHA-256: `fa79e13715a4037bd4a3b412676363c1e451a377eac01d958dbe417d400ec5c6`. The independent publisher-designated QA soundings come from the [USGS data release](https://www.sciencebase.gov/catalog/item/5f6b9ce482ce38aaa24556f7). Frozen map outlines are map inputs, not surveyed shoreline truth; map attribution includes OpenStreetMap contributors.

Source review excluded above-water 1,030/1,032 ft contours and an isolated legend fragment, closed the 1,028 ft contour's printed-label gap, and preserved eight underwater rings plus the source shoreline. The 1,028.5 ft surface and 2 ft interval were explicit. Printed coordinate ticks supplied calibration; no QA depth was used to build the grid. Four controls were derived from the same source-coordinate fit, so their zero residual is **not independent calibration evidence**.

The reviewed build contains eight depth contours, 553 stored contour vertices, a 103 × 127 grid at 5 m spacing, and zero inferred contour values. Source/map shoreline IoU is 0.938. The browser-generated grid exactly matches the offline reviewed fixture grid.

| Independent QA measure | Reviewed King City |
| --- | ---: |
| Soundings / occupied 20 m cells | 25,782 / 21 |
| Reference coverage | 100% |
| Median absolute error, equal cell weighting | 0.120 m |
| 95th-percentile absolute error | 0.291 m |
| RMSE | 0.151 m |
| Within one representative sheet, fixed depth scale | 100% |
| Within one sheet, separately normalized depth scales | 81.4% |
| 95th-percentile normalized sheet difference | 2 sheets |

The earlier browser crop had median error 0.274 m and P95 1.175 m. Calibration, reviewed geometry, and grid resolution all changed, so this comparison cannot isolate the contribution of any one change. The reference covers only 21 cells; it does not validate the entire shoreline or full-lake maximum depth. Normalization uses maximum QA depth, not the lake's known deepest point. Neither layer diagnostic establishes toolpath overlap or physical cutability. Full measurements are in the [JSON receipt](chart-first-release-2026-09-23.json).

A fresh-browser project import and live terrain generation completed with six layers, six cut panels, and no page errors. **Incomplete chart coverage near the map/source shoreline remains a visible warning**; uncovered areas use the existing terrain/model fallback. The screenshot retains that warning. This successful integration does not establish acceptable shoreline appearance for every fabrication.

## Guide screenshots and launch checks

Validated captures: [review workspace](../images/chart-release/king-reviewed-workspace.png), [saved reviewed chart](../images/chart-release/king-reviewed-library.png), and [generated terrain](../images/chart-release/king-generated-terrain.png). [Capture notes](../images/chart-release/README.md) explain their provenance. The real-source browser trial imports an explicitly prepared review draft; it does not demonstrate automatic correction. Synthetic browser tests separately exercise manual correction through visible controls.

Before launch, perform a representative physical cut and assembly at the intended material thickness/kerf, inspect bridges and shoreline fallback, and approve the resulting appearance. Add more independently referenced lakes before expanding the supported profile or claiming broad automatic accuracy. No deployment was performed in this task.
