# Reviewed chart guide captures

These screenshots show the actual local application, captured September 23, 2026 using public-domain USGS King City South source contours. See the [release report](../../reports/chart-first-release-2026-09-23.md) for measurements and limits.

- `king-contour-editing.png`: full-height source chart and right-hand contour repair panel, with an outstanding alignment confirmation.
- `king-reviewed-workspace.png`: source overlay, manually prepared contour corrections, explicit calibration, generated basin and depth preview.
- `king-reviewed-library.png`: saved chart after contour, alignment, and layer review.
- `king-generated-terrain.png`: fresh project import and real terrain generation, six layers/six panels. The incomplete shoreline coverage warning is intentionally retained.

The capture imports a prepared source-bound review draft. It is not evidence of automatic correction or physical fabrication approval. Reproduce with `scripts/verify/chart-release/capture.mjs` followed by `generate.mjs`; do not replace these with unreviewed diagnostic screenshots.

The refreshed captures use the explicit-topology workflow and its default held interior (King City maximum 4.4 m). See [topology validation](../../reports/chart-topology-2026-09-23.md). Historical sounding scores in the original release report used the earlier half-interval assumption.
