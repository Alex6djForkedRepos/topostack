# Roadmap

## Implemented v1 foundation

- First-class flat topographic engravings with independent contour density, heavier index contours, exact single-surface preview, optional engraved border, and an engrave-only 1:1 SVG package.
- Atomm-first static generator and export lifecycle, with independently versioned Atomm releases, checksums, and release receipts.
- Global land-elevation tile flow with offline deterministic fallback.
- Rectangular and circular crops, automatic layer counts without a fixed upper limit, configurable dimensions and material thickness.
- Contour polygon generation, feature filtering, cut/score/engrave IR, per-layer and master SVGs.
- Map, 2D, and stacked/exploded 3D previews.
- OSM PMTiles adapter for classified roads, trails, transportation labels, water, and state/province boundaries; generated latitude/longitude graticules; local IndexedDB projects; undo/redo; and project JSON import/export.
- Custom coordinate-based markers (pin, circle, triangle, star, and cross symbols with per-marker sizing), trails, and boundaries that stay visible across stacked layers.
- Cloudflare Worker with R2 caching, range requests, geocoding, CORS, rate limiting, and observability.
- Editable elevation-label anchors with font-independent vector paths, material-boundary checks, and automatic collision repair.
- Optional next-layer alignment outlines and hidden registration labels for reliable physical assembly.
- Configurable glue-safe material reuse that cuts smaller non-adjacent layers from covered cavities and compacts them into fabrication panels.
- Surveyed lake bathymetry from NOAA/NCEI, USGS, Minnesota DNR, swisstopo, and the Finnish Environment Institute, ahead of terrain-informed HydroLAKES/GLOBathy modeled basins. Ocean bathymetry arrives with the Mapzen terrain tiles.
- Machine work-area splitting for layered models: a staggered seam grid with a configurable offset, interlocking puzzle tabs on covered seams, per-piece assembly ids, and one fabrication sheet per tile. Flat engravings are never split.
- Ranked regional terrain archives with atomic fallback to Mapzen, starting with an NRCan HRDEM pilot in Ontario (development only).
- Prerendered homepage, workflow and reference guides, and a Crater Lake example, with production-only indexing and first-party generation/export metrics.
- In-app feedback that opens prefilled GitHub issues with optional, reviewable diagnostics.
- Deterministic browser generation/export tests across Chromium, Firefox, and WebKit, production release artifacts, hourly and daily canaries, and web bundle budgets.

## Next releases

1. Make regional terrain reproducible at release scale and promote it to production, then add USGS 3DEP as the first independent provider. See the [terrain expansion plan](terrain-expansion-plan.md). Add user-uploaded DEM support where no source has trustworthy terrain or depth.
2. Add custom SVG crop boundaries, DXF export, and per-piece material nesting so a work-area split keeps its nests. (Translated and rotated sheet nesting shipped; see [nesting.md](nesting.md). Filling holes in parts with smaller parts is next there.)
3. Add frames, advanced joinery templates, bills of material, machine presets (including saved work areas), and explicit kerf calibration projects.
4. Add optional cloud project synchronization behind a portable identity adapter.
