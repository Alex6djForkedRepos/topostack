# Real depth-chart stress test - 2026-09-23

**Verdict: the chart workflow works, but general real-chart tracing is not ready for an unqualified success claim.** Three public-domain USGS charts were exercised as eight browser input variants. Every Chromium variant produced a record without an uncaught exception, but every result has a quality caveat. The best prepared chart also passed the complete browser workflow in Firefox and WebKit. A fresh-browser project import generated real Walden Pond terrain with 11 layers and 11 cut panels, reaching **Ready to export** while retaining chart and fallback warnings.

The work includes a reproducible [probe](../../scripts/verify/stress-depth-charts.mjs), [machine-readable measurements](real-depth-chart-stress-2026-09-23.json), and [reviewed screenshot candidates with captions](../images/real-depth-charts/README.md). Nothing was deployed or published into public guide pages.

## Inputs and rights

| Source | Real-data characteristics | Source settings |
| --- | --- | --- |
| [USGS Walden Pond, WRIR 01-4137 cover](https://pubs.usgs.gov/wri/wri014137/pdf/cover.pdf) | Blue contour ink over blue fill; multiple basins; printed labels, legend and scale bar | Metres; depths; 2 m interval |
| [USGS Lake Viking, SIM 3486 sheet 7](https://pubs.usgs.gov/sim/3486/sim3486_sheet07.pdf) | Branching reservoir; closely spaced contours; several unrelated panels; roads and survey annotations | Feet; elevations; surface 863.8 ft; 5 ft interval |
| [USGS King City South Lake, SIM 3486 sheet 2](https://pubs.usgs.gov/sim/3486/sim3486_sheet02.pdf) | Small reservoir; thin contours, coloured fill; comma-formatted elevations; multiple panels | Feet; elevations; surface 1,028.5 ft; 2 ft interval |

USGS-authored map panels are public domain under the [USGS copyrights policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits). Reservoir location insets include OpenStreetMap data; those sheets stay in the ignored download cache, and their full-sheet screenshots are not guide candidates. The generated terrain screenshot retains its OpenStreetMap attribution. Credit USGS when using the Walden chart screenshots.

Sources are downloaded into `.topostack/real-chart-stress/sources/` and verified against SHA-256 pins on every run. PDF bytes are not committed. Crop rectangles and render resolutions are explicit in the probe and JSON receipt. Walden's additional ink-only variant removes the pale fill through a documented colour threshold; it does not replace the real contours with synthetic rings.

## Results

Coverage is the proportion of traced line length assigned a value, **not bathymetric accuracy**. Fit is shoreline overlap. Depths below are decoded/model depths in metres, including for the feet-based sources. Timings are single local development/headless runs, not production performance guarantees.

| Input | Confirmed points | Contours levelled | Shoreline fit | Deepest | Trace + initial preview |
| --- | ---: | ---: | ---: | ---: | ---: |
| Walden, original PDF | 13 | 79.9% | 78.3% | 30.0 m | 3.15 s |
| Walden, colour crop | 7 | 10.6% | 78.8% | **0.0 m** | 2.25 s |
| Walden, ink-only crop, three points | 3 | 7.4% | 88.2% | 30.0 m | 2.11 s |
| Walden, ink-only crop, all lake labels | 18 | **92.8%** | 88.2% | 31.0 m | 2.15 s |
| Viking, original PDF | 17 | 53.5% | **31.4%** | 7.3 m | 4.06 s |
| Viking, crop | 19 | 53.6% | **49.6%** | 17.9 m | 4.38 s |
| King City, original PDF | 8 | 74.5% | 96.2% | 5.0 m | 2.72 s |
| King City, crop | 8 | 53.9% | **68.1%** | 4.4 m | 3.58 s |

All eight records pass the record contract and decode successfully. The Walden colour crop nevertheless contains **533 valid cells, all zero**. Contract validity and a visible 3D preview are therefore insufficient acceptance criteria. Several initial full-sheet clicks fell inside the 12-screen-pixel radius of existing points; the probe records and cancels these edits instead of overwriting another contour's value.

The three-point Walden case deliberately includes 10, 20 and 30 m contours across the lake. Even with the deepest basin named, it covers only 7.4% of traced line length. The UI's three-point minimum is a workflow threshold, not a sufficient sampling recommendation for a real multi-basin lake.

The dense Walden run produces identical key metrics in Chromium, Firefox and WebKit: 18 confirmed points, 49 levelled contours, 92.8% coverage, 88.2% fit and 31 m deepest. All three engines pass both preview modes, saving, applying, export, reload and stopping use. The exported file retains the chart, matching project reference, upload checksum, and public-domain attestation. Mobile checks at 390 x 844 pass the horizontal-overflow assertion; visual review still found an overlay problem described below.

## Confirmed issues and limits

1. **High priority: poor traces can still be saved.** The all-zero Walden grid and badly misregistered Viking grids return normal results. Existing warnings are visible, but the model can still be kept. Add explicit unusable-grid detection and a review gate for poor fit/coverage; do not equate the report's `publishable` licensing flag with quality approval.
2. **High priority: raster segmentation and shoreline choice need real-chart controls.** Blue fill blocks many intended Walden contour hits; ink separation recovers them. Cropping alone does not solve Viking or King City, and King City's crop fits worse than the full PDF. Investigate selectable ink, map masking, explicit shoreline selection and georeferencing before promising broad automatic tracing. The browser rasterizes uploaded PDFs; the batch vector path is a different capability.
3. **Dense input needs better point targeting.** Several distinct reservoir labels fall inside the existing-point edit radius at a 1600 x 1100 viewport. A zoomable chart or tighter explicit edit gesture would let users label adjacent lines reliably. The probe's source-derived click locations are reproducible, but raster snapping can still select the wrong line; inferred values are not independent ground truth.
4. **Mobile review is partly obscured.** In the captured 390 px view, the sticky custom-data panel covers part of the fit warning, and the Feedback tab overlaps the DEM's right edge. The mobile screenshot remains failure evidence, not a guide success image.
5. **Responsiveness merits profiling.** Chromium's 50 ms main-thread heartbeat saw roughly 0.94-1.10 s maximum gaps during trace completion/preview startup. Firefox and WebKit's dense-Walden runs peaked at 117 ms and 79 ms respectively. These observations include UI/3D startup in a dev build and do not attribute the pause to the worker alone.
6. **Lake discovery needs a separate follow-up.** Live name search found Walden's place but omitted the actual lake from its largest-first shortlist; coordinate lookup found HydroLAKES 1050970 as “Unnamed lake.” The repeatable probe selects real outlines through the existing selection function and assigns source names as test setup. It does not claim automated search/map-pointer coverage.

The small selected lake outlines are real data, not synthetic geometry: Walden has 13 vertices in the cached outline and Viking 67. King City uses an OSM outline, refined by the normal selection function. Outline coarseness and survey-date differences can contribute to fit error. No independent sounding dataset, resurvey accuracy, CNC output, long-duration memory soak, or concurrency/load capacity was certified.

## Fixed during validation

The vector label parser rejected valid USGS elevations such as `1,020` and `1,028.5 ft`. It now accepts properly grouped four-digit elevations while retaining the existing size limit and rejecting malformed grouping and large map-grid coordinates.

On King City's actual PDF, this changed vector extraction from 0 directly labelled contours and 86.3% coverage to 10 directly labelled contours and 100% coverage. The vector diagnostics still report contradictory regions, so this is a parser/coverage improvement, not an accuracy certificate. Browser PDF uploads still use raster tracing and manual point entry.

Validation: 75 chart-engine tests pass; chart-engine TypeScript checking and ESLint on changed code pass. The new regression covers valid comma-formatted elevations and rejects malformed or oversized numbers. `git diff --check` passes. The repository-wide changelog check fails on the pre-existing `changelog/unreleased/depth-chart-workspace-grid.md` body-length limit; that unrelated fragment was left unchanged.

## Real terrain integration

The dense Walden export was imported into a **fresh browser context**, with the project moved to Walden Pond. The live map API provided terrain and water data; no terrain or trace responses were mocked. Generation reached Ready to export with 11 layers, 11 cut panels and a visible carved lake bed. The app explicitly reported both chart-derived lake floors and incomplete chart coverage with fallback depths. These warnings are retained in the screenshot.

This confirms transfer, import, chart selection and downstream terrain generation. It does not make the 88.2%-fit chart survey-accurate. Source-image provenance and project references were checked; the original source PDF SHA and the transformed upload SHA are different by design.

## Screenshots and guide use

Four reviewed PNGs are staged under [docs/images/real-depth-charts](../images/real-depth-charts/README.md): point entry, trace review, shaded DEM and generated terrain stack. They demonstrate real operations and preserve all warnings. Use the supplied captions for instruction and troubleshooting. Hold an unqualified “successful automatic trace” guide example until the quality issues above are resolved.

Raw images, mobile evidence, all records and project exports remain under `.topostack/real-chart-stress/`. Nothing was uploaded to a chart catalog; chart storage was isolated browser-local test data.

## Reproduce

Requirements: repository npm dependencies, Playwright browsers, Poppler (`pdftoppm`), and access to the public USGS and map endpoints. Start a local **development** server so the probe can read diagnostics and select real lake fixtures through source modules:

```sh
VITE_MAP_API_URL=https://topostack.app npm run dev -w @topostack/generator -- --host 127.0.0.1 --port 5278
```

Then, from the repository root:

```sh
node scripts/verify/stress-depth-charts.mjs
CHART_STRESS_BROWSER=firefox CHART_STRESS_ONLY=walden-ink-dense node scripts/verify/stress-depth-charts.mjs
CHART_STRESS_BROWSER=webkit CHART_STRESS_ONLY=walden-ink-dense node scripts/verify/stress-depth-charts.mjs
CHART_STRESS_ONLY=walden-ink-dense CHART_STRESS_GENERATE=1 node scripts/verify/stress-depth-charts.mjs
```

Set `CHART_STRESS_URL` for another local port. Downloads and real outlines are cached, with source PDF pins and outline hashes in receipts. Delete only the cached `<lake>-lake.json` files to refresh live outlines; changes to live data can change fit results. The probe uses no synthetic chart or API response fixtures.

Full-run receipts are `<browser>/results.json`; filtered runs use `<browser>/results-<scenario>.json`. A zero exit status means the probe/workflow assertions completed, **not** that every trace is accurate. Quality caveats remain explicit in each scenario's status and in this report. Inspect the record grids and screenshots before any guide promotion.
