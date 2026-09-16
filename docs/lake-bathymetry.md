# Surveyed lake-floor data

TopoStack supplements its HydroLAKES/GLOBathy basin models with public lake
surveys. This is a curated collection of usable datasets, not a claim of complete
worldwide survey coverage. HydroLAKES still supplies the lake outlines.

## Sources

| Source | Coverage | Values and processing |
| --- | --- | --- |
| [NOAA NCEI](https://www.ncei.noaa.gov/products/great-lakes-bathymetry) | Superior, Michigan, Huron, Erie, Ontario, St. Clair | Existing native 3-arc-second grids; depths below each lake's low-water datum. Superior remains a draft. |
| [USGS DDS-72](https://pubs.usgs.gov/dds/dds-72/site/data.htm) | Crater Lake | 2000 multibeam survey, 2 m native grid. Depth = 1882.6 m minus published bed elevation. |
| [USGS DDS-55](https://pubs.usgs.gov/dds/dds-55/pacmaps/lt_data.htm) | Lake Tahoe | 1998 multibeam survey, 10 m grid. Depth = 1899 m minus bed elevation, following the survey report. |
| [USGS MF-2393](https://pubs.usgs.gov/mf/2002/2393/) | Mono Lake | 10 m grid based on 1986–87 survey. Depth = (6390 ft minus bed elevation in feet) × 0.3048. |
| [Minnesota DNR](https://resources.gisdata.mn.gov/pub/gdrs/data/pub/us_mn_state_dnr/water_lake_bathymetry/metadata/metadata.html) | 2,000 processed lake basins | Linear interpolation of the published survey contours onto a 20 m grid, clipped to DNR water outlines and islands. Source negative feet become positive meters. Ten basins with insufficient depth contours are omitted. |
| [swisstopo swissBATHY3D](https://www.swisstopo.admin.ch/en/height-model-swissbathy3d) | All 22 lake grids in the retrieved catalog | Native 1–3 m LN02 bed elevations averaged to 10 m for serving. Extent varies by lake. |
| [Finnish Environment Institute (Syke)](https://ckan.ymparisto.fi/dataset/jarvien-ja-jokien-syvyysaineisto) | 1,821 processed lakes with usable depth contours and depth-area masks | Linear interpolation of survey depth contours in meters onto a 20 m grid; no extrapolation outside the measured contour hull or depth-area mask. |

Swiss coverage includes Ägeri, Baldegg, Biel, Constance, Brienz, Hallwil, Joux,
Geneva, Neuchâtel, Maggiore (Swiss portion), Lungern, Morat, Rotsee, Sarnen,
Sempach, Sils, Silvaplana, Thun, Lucerne, Walensee, Zürich (main lake), and Zug.
Some shorelines and survey holes remain uncovered.

[scripts/data/lake-survey-builds.json](../scripts/data/lake-survey-builds.json)
records initial archive sizes/digests, processed-grid counts, and skipped lake IDs.
Finnish depth areas without lake identifiers are excluded; shoreline-only or
degenerate contour records retain the existing fallback.

Swiss data store absolute **bed elevations**, not water depths. For each lake,
the loader subtracts these values from its HydroLAKES surface elevation. That
alignment is approximate: HydroLAKES and LN02 are not transformed to a common
vertical datum. It preserves surveyed bed shape, but the absolute depth can
include reference-level error. A missing surface reference produces a fallback
warning rather than a guessed depth.

All surveys are historical. The USGS reference levels and HydroLAKES outlines
are not live water levels. Minnesota and Finnish rasters are **survey-derived
interpolations**, not new sonar measurements. Resolution and numeric encoding
precision do not imply equivalent survey accuracy.

## Loading and fallback

- `scripts/data/lake-bathymetry.json` is the shared source registry used by the
  browser, gateway allowlist, and provisioning script.
- The browser requests only providers whose bounds intersect the crop, with at
  most 24 tiles per provider. It samples numeric PNG values without canvas color
  conversion. Each provider is loaded once even when several lakes are present.
- Samples are masked against each project's lake polygon, including islands.
  Neighboring lakes cannot acquire a source merely because they share a tile.
- Providers are ordered by priority. Later providers fill missing pixels without
  replacing earlier valid samples. NOAA's lake-ID checks remain in place.
- Missing pixels use the existing terrain or basin model. A failed provider does
  not discard data from another provider. Partial availability produces a warning.
- Attribution and dataset versions are recorded only when that provider supplies
  samples to a lake. Retries replace old survey provenance to avoid stale claims.
- Turning depth on after generation loads the surveys. Changing the depth scale
  reuses a successful load. Depth remains relative to the terrain's vertical scale.

The PNG encodings are `depth-terrarium-v1` and `elevation-terrarium-v1`:
`R * 256 + G + B / 256 - 32768`, in meters; alpha 0 is missing data. Only the
registered dataset/encoding/maximum zoom combination is accepted. Small lakes
may have no tiles at low zooms; their PMTiles minimum zoom need not be zero.

## Reproducible builds

Use Python 3.13 (compatible wheels are available for all GIS dependencies), curl,
and the PMTiles CLI. The runtime web application has no new dependencies.

```sh
python3.13 -m venv /tmp/topostack-surveys-venv
/tmp/topostack-surveys-venv/bin/pip install -r scripts/survey-requirements.txt
/tmp/topostack-surveys-venv/bin/python scripts/test_survey_bathymetry.py
/tmp/topostack-surveys-venv/bin/python scripts/build-survey-bathymetry.py \
  --cache /tmp/topostack-lake-surveys \
  --out-dir /tmp/topostack-survey-archives
```

Use `--dataset usgs-crater-lake-v1` (or another registry ID) to build one archive.
The existing NOAA builder is documented in [noaa-bathymetry.md](noaa-bathymetry.md).

Downloads are checked against SHA-256 pins in
`scripts/data/lake-survey-sources.json`. Above-water values and invalid samples
are excluded before numeric encoding. Source ZIP paths are checked before
extraction; the oddly named Crater Lake `.tgz` is actually a ZIP containing a TAR.
Tahoe's legacy floating-point E00 grid is decoded and its dimensions checked.

The builder refuses existing PMTiles/MBTiles output paths. Each output has a
`.sources.json` receipt containing input pins, output digest, grid extents, and
tile count. Regional skipped records are saved in the cache directory. Prepared
grids in the cache speed reruns; delete those prepared grids when changing the
processing algorithm, and use a new dataset version for changed source meaning.

## Provisioning and deployment

Archives use versioned keys in the existing `VECTOR_DATA` bucket. No new Worker
binding or secret is required. Provision each completed archive with its receipt's
SHA-256, for example:

```sh
node --env-file=.env scripts/provision-lake-data.mjs \
  /tmp/topostack-survey-archives/usgs-crater-lake-v1.pmtiles \
  --source=usgs-crater-lake-v1 --provision --expected-sha256=<receipt-sha256>
```

Development is the default. `--prod` additionally provisions production and
requires a digest. Provisioning data and deploying the app are separate steps.
The gateway exposes only registered `/v1/bathymetry/<dataset>.pmtiles` paths,
using its existing bounded Range/CORS/cache handling. Surveys are optional for
`/ready`, and existing archives remain available for rollback.

## Validation

```sh
VITE_MAP_API_PORT=8893 TOPOSTACK_WEB_PORT=5293 npm run dev
# In another terminal, after development archives have been provisioned:
node scripts/verify-surveys-live.mjs
# To check only Finland after adding its archive:
node scripts/verify-surveys-live.mjs --dataset=syke-finland-lakes-v1 --coverage-only
```

The browser check uses real HydroLAKES polygons and real depth archives, checks
new source coverage, and generates a Crater Lake fabrication ZIP after enabling
depth. It then interrupts survey requests and verifies warning-bearing fallback
exports. Reports and ZIPs are written to `/tmp/topostack-survey-validation`.
Run it separately from builds/coverage to avoid Vite reloads during the test.
`SURVEY_TEST_BROWSER=firefox` or `webkit` selects another installed Playwright
browser; Chromium is the default.

The committed fixtures contain small real Crater Lake and Swiss PNG tiles with
expected numeric samples. Unit tests also check per-lake masking, different
surface references, missing references, source failures, and provenance retries.

## Other catalogs investigated

There is no single complete public lake-survey feed. Additional candidates need
source-specific validation before being added to the registry:

- Yellowstone SIM 2973's downloadable GIS package lists geological polygons,
  faults, vents, and flow arrows; its bathymetry presentation is not a verified
  numeric bed grid in that package.
- Lake Mead OFR 03-320 combines surveyed areas, pre-impoundment contour models,
  and surrounding terrain. Its vertical units/reference and survey footprint
  must be established before using its composite raster as lake depths.
- DAHITI offers lake bathymetry downloads behind registration.
- GLOBathy and 3D-LAKES provide much broader **estimated** bathymetry. They must
  retain modeled provenance and should not be labeled as measured surveys.

Adding a source requires verified redistribution terms, numeric depth/elevation
values and units, a known horizontal reference, appropriate lake masks, source
pins, and regression samples. Raster-looking shaded-relief images are not depth
rasters. Coverage remains limited to valid samples and available lake outlines.

## Fit lake depth to available layers

In **Map details → Water depth**, enable **Fit lake depth to available layers**, or choose **Fit depth** in the clipping warning. The setting defaults to off, including for older saved projects.

When a lake exceeds the stack floor, fitting compresses all its depths by the same factor around its waterline. Each lake fits independently; shallower lakes keep their requested depth scale. Land, islands, and ocean depths keep their existing behavior. The material thickness and layer budget still limit the detail the model can resolve. If no depth fits below a lake's waterline, the clipping warning remains.

The depth exaggeration control remains the requested multiplier. Each fitted lake displays its effective multiplier relative to terrain and percentage of requested depth. The exported project JSON records the setting, per-lake compression, effective multiplier, and bed elevation before fitting; the fabrication README also lists applied scales. Turning fitting off restores the requested depths from the original source data. Fitting stays enabled after a refresh because it is saved with the project; the preview shows **Use manual depth** while it is enabled. The **Fit depth** warning takes priority over other preview warnings so its action remains visible.

## Searchable public directory

`/guides/lake-depth-data` lists the integrated lakes and basins, with search by source names, aliases, county/region and survey IDs. Each record links to a padded survey extent in the studio. Opening a lake retains fabrication preferences, selects layered output with water depth on, and requires fresh generation before export. The link is consumed once so subsequent reloads restore the edited project.

The directory includes every contributing regional grid in the verified archive receipts, plus the three USGS lakes and six NOAA lakes (including St. Clair). Counts refer to lake/basin records: a lake can have several named basins, and a survey can cover only a portion of a lake. Very small lakes may lack a matching HydroLAKES outline in the studio. Regional contours are labeled separately from surveyed grids. No GLOBathy-only basins are included.

Regenerate the static catalog after rebuilding or adding survey archives:

```sh
/tmp/topostack-surveys-venv/bin/python scripts/build-lake-directory.py \
  --cache /tmp/topostack-lake-surveys \
  --archives /tmp/topostack-survey-archives
```

The generator checks the regional download checksums and matches receipts to `scripts/data/lake-survey-builds.json`. It reads Minnesota DNR outline names/counties and Syke depth-area names, preserves regional survey identifiers, and includes curated Swiss names/aliases. Update the committed build receipts and name mappings when sources change. The resulting `apps/generator/static/data/lake-depth-directory.json` is fetched only on the directory page; it is excluded from the studio's startup JavaScript.
