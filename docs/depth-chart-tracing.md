# Depth charts traced into bathymetry

Many lakes have no digital survey but do have a published depth chart: a scanned or PDF contour map with depth labels. Tracing a chart turns it into the same depth grid a survey provides, so `carveWaterDepth` carves it with no new geometry code.

## Status

| Stage | State |
| --- | --- |
| Record contract (`@topostack/data-contracts/chart-bathymetry`) and core carving with `bathymetryOrigin: "chart"` | Done |
| `@topostack/chart-trace`: georeferencing and gridding | Done |
| `@topostack/chart-trace`: vector PDF extraction (paths and text layer) and level inference | Done |
| `@topostack/chart-trace`: colour segmentation, line tracing, label reading for scans | Done (labels best-effort; see below) |
| `@topostack/chart-trace`: level inference that survives leaky scans (a facing graph beside raster regions) | Done |
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

## Reading vector charts

A GIS-exported PDF already holds the contours as paths and the labels as text, so no pixels are traced. What the export does not hold is which label belongs to which path.

- **What the export gives.** The TWDB sheet draws its about 1,700 contour paths in seven stroke styles. Index contours (275, 300) are heavier; the lighter levels cycle through six colours, so style never identifies a level. Only 32 labels sit on the lines, rotated along them. The page also has a legend, grid ticks and a scale bar that look like labels, so the maker marks a map area and picks the contour and shoreline styles from `strokeStyles`. The batch manifest records the same choices.
- **Chaining.** Paths are joined only where exactly two ends meet. Where three or more ends meet, lines of different levels are touching, and joining through that point once put 300 and 305 on one chain. Label gaps are bridged only when both ends point across the gap.
- **Labelling.** A label names the nearest line that runs along it, within about its own height.
- **Inferring the rest.** `levels` rasterizes all lines, floods the space between them into regions, and solves three constraints:
  - A region touching two neighbouring levels is the band between them.
  - The shore band reaches the first rung inward from the surface, which need not be on the interval: 322 ft down to 320.
  - A contour parts the band below its level from the band above it, so one known side gives the other.

  Real sheets leak: lines crowd closer than a raster cell, and gaps at the map edge join bands that should be separate. So each unlabelled line also votes along its length: rays sideways to the nearest known line on each side name the single rung between them.
- **Result on the TWDB sheet.** 32 labels on 10 chains lead to 48 more inferred, covering **86%** of the contour length. The inferred levels nest in order from 320 at the shore to 270 at the dam. The rest is mostly small closed loops and scraps that bound no band.

## Reading scanned charts

A scan becomes the same kind of page as a vector chart: traced lines stand in for paths, and read labels stand in for the text layer. From there it runs the vector route above.

- **Ink.** Ink is everything darker than Otsu's split of the page, or near colours the maker picks from a k-means palette. The scan is traced at most 4096 px across. Specks, dots and lone digits are dropped, a closing heals hairline breaks, and Zhang–Suen thinning leaves one-pixel lines that keep their topology.
- **Lines.** A skeleton pixel's role comes from how many separate branches leave it, not from its neighbour count, so the staircase corners thinning leaves stay inside lines. Short dead-end spurs are pruned, and each line keeps its stroke width.
- **What scans need beyond the vector route:**
  - **Crossings.** Section lines and roads cross contours in the same ink, so chaining continues straight through junctions.
  - **Straight lines.** Long, ruler-straight lines are dropped.
  - **Label gaps.** They are bridged more readily where a label sits in the gap.
  - **The shore.** It is inferred as depth 0 from the band beside it, with no depth allowed shallower than that. "Auto" shoreline detection by stroke width exists, but Lake Margrethe draws its shore no bolder than its contours; there, the heavy lines are the frame, roads and lettering.
- **Finding labels.** Loose labels are digit-sized ink clusters. At tracing resolution, a label that fills its contour's gap fuses into one blob, and the skeleton runs straight through it. What gives it away is the stroke swelling to two or three times the line's width for about a label's length. Each candidate is cropped from the full-resolution scan, turned upright along its line, and read both ways up by the OCR engine the caller passes in.
- **Levels on scans.** Raster regions alone fail on a scan. Every unbridged gap joins two bands, and on Lake Margrethe the regions merged into a few huge contradictory ones: three hand-given labels levelled about 4% of the length. `levels` therefore also builds a facing graph. Rays cast left and right from samples along each line record which line each side faces across open water, and then three rules run:
  - **Between.** A line whose two sides, sample by sample, face known levels one rung apart on either side takes the rung between.
  - **Orientation.** A known line learns which of its sides is higher from neighbours one rung away.
  - **Propagation.** An oriented line gives the next rung up to lines facing its higher side, and the next rung down to lines facing its lower side.

  Every rule needs a clear majority of samples, and orientation and propagation count only lines that see each other both ways. A frame or road collects rays that slip through gaps in the contours, but it does not see the far contour back. Whatever the shore faces on its land side is marked land and never takes a level. That covers frames, roads and the legend box, though not the land beyond them, since spreading further would leak back into the lake through the same gaps.
- **Result on Lake Margrethe.** Tracing works: each contour comes out as one long chain through crossings and label gaps. With three labels given by hand (10, 20 and 35 ft on one slope), inference levels the lake from the shore at 0 ft down to its 55 ft holes, in nested order. That is **55%** of all traced length. The total includes the frame, legend and lettering, which correctly stay unlevelled. A few road stubs by the shore still get levels, which is harmless because gridding uses only cells inside the georeferenced water outline.
- **OCR on Lake Margrethe.** Tesseract with a digit whitelist reads loose labels. It reads the italic labels set into the lines poorly, because pieces of the contour inside the crop confuse it. Dash marks and symbols also produce stray digits; with the interval known, labels off the chart's ladder are dropped, which removes most of them. On scans like this, the dependable route is the wizard's: the maker clicks a few lines and types their depth, and inference fills in the rest for the maker to confirm.

The adapter reads the page with pdf.js 6, which the caller passes in. 5.x carries a high-severity advisory, so it is not supported.

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
