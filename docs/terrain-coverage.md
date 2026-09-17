# Curated terrain coverage

Decision: data acquisition and publication are operator-controlled. Application
requests only read approved, versioned datasets. The application never discovers
providers, queues terrain builds, or publishes new data. Manual bulk preparation
may use scripts, but a person chooses the products, extent, and release.

## What is operational today

- Worldwide fallback: existing Mapzen Terrain Tiles composite. Its underlying
  datasets and effective resolution vary by location; inspect recorded imagery
  provenance rather than assuming it is uniformly 30 m or current lidar.
- Preferred coverage: three verified NRCan regional archives in Ontario, recorded
  in `scripts/data/terrain-sources.json`. These cover the two Alexander Lake areas
  and an additional region west of the western lake. Archives are published in
  **development**, not production. Countrywide preferred coverage is not yet built.
- Source selection: explicit quality priority, then native resolution, acquisition
  year, and stable ID. Only valid samples claim coverage; gaps fall through.
  Archive metadata is checked, and source contributions travel with exports.

The provider inventory below is a preparation plan, **not** an enabled catalog.
Do not add nationwide bounding boxes to the runtime catalog until corresponding
archives exist and their actual coverage has been checked.

## Initial base set to prepare

| Area | Broad baseline / preferred product | Higher-detail coverage | Official reference |
| --- | --- | --- | --- |
| Canada | MRDEM-30 **DTM**, nationwide 30 m baseline | HRDEM bare-earth mosaics at 1 m / 2 m where valid | [NRCan strategy](https://natural-resources.canada.ca/maps-tools-publications/satellite-elevation-air-photos/national-elevation-data-strategy) |
| United States | 3DEP seamless 1/3 arc-second (~10 m) where available; verify Alaska/territory product coverage separately | 3DEP 1 m projects and published seamless 1 m areas | [USGS products](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services), [seamless 1 m](https://www.usgs.gov/3d-elevation-program/new-product-3d-elevation-program-seamless-1-meter-digital-elevation-model-s1m) |
| England | Environment Agency lidar composite **DTM**, 1 m, approximately 99% coverage | Review newer local surveys where useful | [EA lidar collection](https://www.data.gov.uk/collections/environment/lidar) |
| New Zealand | LINZ national elevation products | National Elevation Programme bare-earth lidar coverage; verify native resolution and acquisition per release | [LINZ elevation](https://www.linz.govt.nz/products-services/data/types-linz-data/elevation-data) |
| Switzerland / Liechtenstein | swissALTI3D, 2 m option | 0.5 m option where output scale benefits | [swisstopo](https://www.swisstopo.admin.ch/en/height-model-swissalti3d) |
| Australia | Retain current global fallback while evaluating national DEM variants | Geoscience Australia 5 m lidar DEM coverage; it is not complete national lidar coverage | [GA lidar DEM](https://services.ga.gov.au/gis/rest/services/DEM_LiDAR_5m_2025/MapServer) |

Reviewed 2026-09-16. Product availability does not establish that a release has
been licensed, downloaded, normalized, or activated in TopoStack. Add further
countries to this inventory as their authoritative products are assessed.

## Release workflow

1. Choose a named provider release, intended regional coverage, and priority.
   Prefer broad national baselines before accumulating isolated lake-sized patches.
2. Record licence/redistribution terms, attribution, source URLs, checksums or
   object pins, acquisition date when known, native resolution, ground-vs-surface
   semantics, vertical units and datum, and actual NoData coverage.
3. Normalize to the numeric elevation archive contract. Heights must be metres.
   Horizontal reprojection alone does not normalize vertical datums. The current
   validator admits CGVD2013 only; admitting another national datum requires
   explicit normalization/mixing policy and fixtures, not relabelling heights.
4. Build offline in bounded geographic chunks with reproducible receipts.
   Countrywide packaging and storage estimates must be prepared before bulk
   imports: the existing builder has a 100-million-sample limit and writes through
   zoom 15. It is a regional tool, not yet a national-scale tiling pipeline.
5. Compare source samples, contour quality, coverage edges, tile seams, and
   overlap behavior. Check that nominally finer data actually improves the result.
6. Stage and verify full archive hashes, promote the data release, then enable its
   catalog registration in the application release. Keep rollback receipts.

Use `scripts/discover-terrain.py` manually to inspect Canadian candidates and
prepare approved areas. `--build`, `--register`, and archive `--promote` remain
explicit operator actions. The discovery script is never called by the app.

## Selection policy

Retain a worldwide fallback. Above it, register approved national bare-earth
baselines and then verified regional lidar DTMs. Priority is a curation decision;
smaller advertised pixels alone do not prove better ground elevations. Do not
substitute a DSM containing vegetation/buildings for a DTM without explicitly
changing the product contract. Lake-floor bathymetry is separate from land terrain.

See [terrain selection](terrain-selection.md) and [archive preparation](hrdem-terrain.md).
