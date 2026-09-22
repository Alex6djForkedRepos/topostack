# @topostack/chart-trace

Turns a lake depth chart into bathymetry. The batch build runs it in Node for curated public charts; the studio will run it in a worker for charts makers upload. The output is the grid inside a `UserChartBathymetryV1` record from `@topostack/data-contracts/chart-bathymetry`. See [docs/depth-chart-tracing.md](../../docs/depth-chart-tracing.md).

| Subpath | Owns |
| --- | --- |
| `@topostack/chart-trace/georef` | Placing chart pixels on the ground as a pixel→lon/lat homography. Two routes: a least-squares affine or homography fit from clicked control points, or snapping a traced shoreline onto the known lake outline. Snapping tries each orientation, with and without a mirror, then refines with symmetric ICP and reports the overlap (IoU). |
| `@topostack/chart-trace/grid` | Interpolating contours and spot soundings into a lon/lat-aligned depth grid. `harmonic` (the default) solves Laplace's equation with contours fixed and the shore at zero, and domes flat pools enclosed by a single ring. `tin` ports `survey_regions.contour_grid` exactly, for parity with the published contour surveys. |
| `@topostack/chart-trace/local-frame` | The lake-centred equirectangular metre frame both modules work in |
| `@topostack/chart-trace/pdf` | Reading one vector PDF page into styled polylines and positioned text (`VectorPage`, top-left origin, y down). pdf.js 6 is passed in by the caller, so this package never bundles it. |
| `@topostack/chart-trace/vector-chart` | Choosing contour strokes (`strokeStyles`), chaining fragments only where exactly two ends meet, bridging label gaps that continue the line, and reading labels that lie on and along a line |
| `@topostack/chart-trace/levels` | Levels for unlabelled lines from topology. The space between contours is rasterized into regions, each a band between neighbouring levels, seeded by labels and the shoreline and propagated across known lines. A sideways ray vote handles regions that leak. |
| `@topostack/chart-trace/raster` | Pixel work on scans: downsampling, ink by darkness (Otsu) or chosen colours (CIE L\*a\*b\*), a k-means palette for picking swatches, component cleanup, closing, a chamfer distance transform, and Zhang–Suen thinning |
| `@topostack/chart-trace/raster-labels` | Finding labels on a scan (loose digit clusters, and places where a label fused into its line swells the stroke), turning each crop upright along its line, and reading it both ways up with an OCR engine the caller passes in |
| `@topostack/chart-trace/trace-raster` | The scan route: skeleton to lines with stroke widths, spur pruning, optional shoreline by stroke width, then the vector route with junction continuation and straight-line removal. `traceScannedChart` adds the label search and OCR. |
| `@topostack/chart-trace/trace-vector` | The whole vector route from a `VectorPage` and the chosen styles to contours with levels, plus diagnostics (coverage, disagreeing labels, contradictory regions) |

Like `@topostack/data-contracts`, the package is source-only and has no DOM, Svelte, or storage imports. Relative imports carry `.ts` extensions so Node's native type stripping can run it without a build step.

`src/fixtures/tin-parity.json` is produced by `scripts/data-build/make-chart-trace-fixture.py`. `grid.test.ts` requires the TypeScript TIN to match it to the centimetre. Regenerate the fixture whenever `contour_grid` changes.
