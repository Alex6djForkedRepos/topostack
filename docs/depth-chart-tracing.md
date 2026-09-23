# Depth charts traced into bathymetry

Many lakes have no digital survey but do have a published depth chart: a scanned or PDF contour map with depth labels. Tracing a chart turns it into the same depth grid a survey provides, so `carveWaterDepth` carves it with no new geometry code.

## Status

| Stage | State |
| --- | --- |
| Record contract (`@topostack/data-contracts/chart-bathymetry`) and core carving with `bathymetryOrigin: "chart"` | Done |
| `@topostack/chart-trace`: georeferencing and gridding | Done |
| `@topostack/chart-trace`: vector PDF extraction (paths and text layer) | Planned |
| `@topostack/chart-trace`: colour segmentation, line tracing, label reading | Planned |
| Batch pipeline for curated public charts, published as a survey archive | Planned |
| Loading saved charts in the studio, IndexedDB storage, project import and export | Planned |
| Tracing wizard in the studio, with OCR loaded only when needed | Planned |
| Reviewed catalog submissions through the map-api Worker | Planned |

## The record

`UserChartBathymetryV1` is JSON-safe, so one record serves IndexedDB, project files, submission bodies, and the files the batch build commits.

**Contours are the source of truth.** The traced contours and spot soundings are stored in lon/lat. The grid is derived from them deterministically, so a reviewer can regenerate it and a better interpolator can replace it later.

**The grid** is stored as base64 little-endian uint16 decimetres, row-major from the north-west corner. `0xffff` marks cells the chart does not cover. This covers depths up to the contract's 1500 m limit and keeps a 1024×1024 grid under 3 MB of text. Use `encodeChartDepths` and `decodeChartDepths`; do not hand-roll the packing.

**Labels** records whether the chart printed depths or elevations. Reservoir charts often label contours in feet above a datum. Those contours are converted to depths below the recorded `surfaceElevationM` before they are stored (`chartLabelDepthM`), so every consumer reads depths.

**Georeferencing** is stored as a 3×3 homography from chart pixels to lon/lat. It also keeps the control points or the snap IoU, and the ground residual, so a reviewer can judge the fit.

**The licence attestation** decides where a record may go. `personal-use` charts stay on the maker's device; only `own-work`, `public-domain`, and `open-license` records may be published (`isPublishableChart`). Publishing shares contours and grids, never the scanned image, unless the attestation allows it.

## What real charts look like

Three public charts were chosen as reference inputs, one for each style the tracer must handle. They are **not committed**. Their publishers' terms do not clearly allow redistribution, and Minnesota's sheet carries a state copyright. Tests that use them should fetch each chart by URL and check it against a SHA-256 pin. Only synthetic fixtures belong in the repo.

| Chart | Style | What it demands | Ground truth |
| --- | --- | --- | --- |
| Michigan DNR, [Lake Margrethe](https://www2.dnr.state.mi.us/Publications/pdfs/ForestsLandWater/_Archived/Inland_Lake_Maps/CRAWFORD/LAKE_MARGRETHE.PDF) (1938–39) | Clean hand-drawn ink, 1-bit CCITT scan inside a PDF | Rotated north arrow, so snapping must try every rotation, not only flips. Depths are in feet on a 5 ft interval with primed labels (`10'`). Section lines cross the lake, and soundings, symbols and a legend box share the sheet. | The state's digitized Inland Lake Contours layer |
| Minnesota DNR, [Ten Mile Lake](https://files.dnr.state.mn.us/lakefind/data/lakemaps/b0290010.tif) | Degraded scan served as a CCITT G4 TIFF, 10800×7200 | Browsers cannot decode G4 TIFF, so the wizard needs a small lazy decoder. The sheet has heavy blotches, crowded labels, contours that merge on steep slopes, and neighbouring lakes. | `mn-dnr-lakes-v1` |
| TWDB, [Cedar Creek Reservoir](https://www.twdb.texas.gov/hydro_survey/cedarcreek/2017-10/CC17_ContourMap.pdf) (2017) | Vector GIS PDF with a text layer | Contours are elevations above mean sea level (pool at 322 ft). Its paths, labels and State Plane grid ticks can be read directly from the PDF, with no OCR or raster tracing. | None archived |

The TWDB case moves **vector PDF extraction** ahead of raster tracing. For modern GIS charts it gives exact lines and labels, and possibly georeferencing from the grid ticks.

## Georeferencing and gridding

`@topostack/chart-trace` does both in a lake-centred metre frame, so residuals are ground distances and grids are square in metres and aligned to lon/lat.

**Georeferencing** has two routes:
- **Control points.** Three clicks give an affine fit; four or more give a homography, which also absorbs a phone photo's perspective.
- **Snapping.** A traced shoreline is matched to the known lake outline. Starting guesses come from area moments, trying each principal-axis orientation with and without a mirror (pixel rows run down), and a full turn of guesses for a near-round lake. Symmetric ICP then refines each guess to an affine map, and the best is kept by IoU. Below `SNAP_MIN_IOU` (0.9), the maker is asked for control points instead. Affine snapping can make a wrong but similar lake overlap quite well, so the studio shows the snapped chart over the map before accepting it.

**Gridding** has two methods:
- **`harmonic`** (the default). Contour cells are fixed at their depth, land is fixed at zero, and Laplace's equation is solved by coarse-to-fine red-black SOR. This follows the slope a chart implies and covers the whole lake, where a TIN leaves terraces between vertices of one contour and blanks outside their hull.
  - Laplace alone would leave a region enclosed by one ring perfectly flat, and pinning a single cell only makes a spike. So such a pool is filled with a smooth dome `d ± step·(2t − t²)` over its distance from the ring. It levels off half an interval past the ring, or at the deepest sounding inside it. Rings marked `inside: "shallower"` dome upward, as humps.
- **`tin`** ports `survey_regions.contour_grid` line for line and is held to it by a fixture the Python generates. It exists so charts and published contour surveys can be gridded identically.

## How it carves

A chart reaches geometry as `WaterAreaV1.bathymetry` with `bathymetryOrigin: "chart"`. From there:

- It carves exactly like a survey. It is anchored to the terrain waterline, and uncovered cells fall back to existing terrain or the modeled basin.
- The surface reports `depthSource: "user"` and `bathymetryOrigin: "chart"`, whether or not the chart has gaps.
- The map warns once with `LAKE_DEPTH_FROM_CHART` rather than `LAKE_DEPTH_PREDICTED`. Gaps and misaligned grids raise the usual per-lake `BATHYMETRY_FALLBACK`, naming the depth chart.
- A per-lake maximum-depth override still applies, but it only shapes the modeled depths in the chart's gaps.
