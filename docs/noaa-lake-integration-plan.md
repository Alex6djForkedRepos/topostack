# NOAA lake depth integration plan

How to bring every lake NOAA can supply depths for into the survey data system. The work runs from a local clone. The research behind it is in the [NOAA lake depth coverage report](reports/noaa-lake-coverage-2026-09-24.md).

Each phase ends in its own pull request to `dev`. Stop at the end of any phase and the app is still consistent: the data is either not registered yet, or registered, built, provisioned and tested.

## Why the work is split this way

- **One bounding box per provider.** `lake-bathymetry.json` gives each provider a single bounding box. The browser tries every provider whose box overlaps the crop, with up to 24 tile requests each.
  - A single US-wide NOAA dataset would do that on almost every US project.
  - It would also overlap Minnesota DNR, TWDB, USBR, Ontario and the Great Lakes, where registry order decides which source wins.
  - So NBS lakes ship as **regional datasets** with tight boxes, placed after the existing providers.
- **Hardcoded builders.** `build-survey-bathymetry.py` picks a builder by dataset ID (`main`, around line 334). A new source kind needs its own handler and branch.
- **Versioning.** Datasets are versioned. `noaa-great-lakes-v1` keeps its meaning; finer Great Lakes grids become a new dataset ID (see [noaa-bathymetry.md](noaa-bathymetry.md)).
- **Surface reference.** Neither NBS tiles nor ENCs state a lake surface in the lake's own terms. A lake ships only once its depths can be referenced to its waterline. Otherwise it keeps the existing fallback. No guessed offsets.

## Local setup

```sh
git fetch origin && git switch dev && git pull
git switch -c noaa-lake-coverage
git am /path/to/noaa-lake-coverage.patch   # the report and this plan, if the branch was not pushed

npm ci
python3.13 -m venv /tmp/topostack-surveys-venv
/tmp/topostack-surveys-venv/bin/pip install -r scripts/data-build/requirements.txt
/tmp/topostack-surveys-venv/bin/python -m unittest discover -s scripts/data-build -p 'test_*.py'
pmtiles version                           # the PMTiles CLI, as for the existing survey builds
```

The build needs to reach these hosts:

| Host | Used for |
| --- | --- |
| `noaa-ocs-nationalbathymetry-pds.s3.amazonaws.com` | NBS tile schemes and tiles |
| `noaa-nos-coastal-lidar-pds.s3.amazonaws.com` | CUDEM |
| `www.charts.noaa.gov` | ENC downloads |
| `www.ncei.noaa.gov` | existing Great Lakes grids |

Phase 4 reads ENCs through the GDAL build inside the pinned fiona wheel. The fiona 1.10.1 Linux wheel includes the S-57 driver (checked 2026-09-24). Confirm it on your platform:

```sh
/tmp/topostack-surveys-venv/bin/python -c "import fiona; print('S57' in fiona.supported_drivers)"   # expect True
```

## Phase 0: inventory and pins (build scripts only)

Goal: the real lake list, tile counts and archive sizes, pinned so later builds are reproducible.

1. Add `scripts/data-build/nbs_inventory.py`, with a test beside it.
   - It downloads the dated tile schemes into the cache:
     - `Test-and-Evaluation/Modeling/_Modeling_Tile_Scheme/*.gpkg`
     - `BlueTopo/_BlueTopo_Tile_Scheme/*.gpkg`
   - It records their SHA-256.
   - For each delivered tile, it reads the `.aux.xml` raster attribute table. Each row gives `source_survey_id`, `source_institution`, `survey_date_*`, `data_assessment`, `license_name` and a cell count.
   - It classifies each tile against lake outlines (HydroLAKES polygons through the existing outline pipeline, or `lake-outline-coverage.json`):
     - **inland lake:** the tile covers a lake polygon, and the covered cells come from survey sources rather than `NBS Generalization`
     - **Great Lakes**
     - **ocean or estuary**
   - Output is written to the cache: `nbs-inventory.json`, with lake → tiles → sources, measured cell counts and survey years.
2. Review the inventory by hand.
   - Confirm each lake has measured cells, not filler.
   - Settle the section 3 lakes from the report: Charlevoix, the Keweenaw lakes, Pere Marquette and the St. Marys lakes.
   - Decide the regional grouping. The proposed groups follow what the report confirmed:

   | Dataset ID | Lakes | Bounding box (approx.) |
   | --- | --- | --- |
   | `noaa-nbs-pacific-northwest-v1` | Washington, Union, Pend Oreille, Lake Roosevelt, Columbia and Snake pools | −123, 45.5, −116, 49 |
   | `noaa-nbs-michigan-harbors-v1` | Portage (Onekama), Muskegon, White, Spring, Macatawa, Manistee (plus any confirmed in step 2) | −86.6, 42.7, −84, 47.3 |
   | `noaa-nbs-wisconsin-v1` | Winnebago | −88.7, 43.7, −88.2, 44.3 |
   | `noaa-nbs-florida-v1` | St. Johns lakes, Crescent, Lake Worth Lagoon, Wimico | −85.5, 26.5, −80, 29.6 |
   | `noaa-nbs-gulf-lakes-v1` | Pontchartrain, Maurepas, Borgne, Salvador, Sabine, Calcasieu | −94, 29.5, −89.5, 30.5 |

3. Pin each selected tile in `scripts/data/lake-survey-sources.json`.
   - Fields: `id`, `dataset`, `url`, `sha256` taken from the scheme GeoPackage, `resolutionM`, `epsg`, and `verticalReference` text.
   - Commit the inventory summary under `docs/reports/data/`.

Exit: the pins and inventory report are merged. No registry change, so nothing reaches users.

## Phase 1: surface references (per lake)

Every NBS elevation is relative to the sources' chart datum or water-level surface. That is `MLLW` for tidal lakes. For Lake Washington, the Great Lakes and river pools it has to be established per lake.

For each lake, record in its pin:

- **`surface`:** the reference level the grid's zero corresponds to, with its source. Candidates:
  - the NOAA station datum page, for tidal lakes
  - the USACE pool elevation, for Columbia and Snake reservoirs
  - Low Water Datum (IGLD85), for Great Lakes-connected lakes
  - the chart datum printed on the lake's chart
- **`surfaceNote`:** the vertical-reference note shown in the directory, like the reservoir `verticalReference`.

Depth is then `-elevation` below that datum, and the browser anchors it to the terrain waterline, as it does for `noaa-great-lakes-v1`. A lake whose reference cannot be established is dropped from the phase 2 build and listed in the builds `skipped` list with the reason.

## Phase 2: NBS inland lakes

1. **Builder.** Add an `nbs()` handler to `build-survey-bathymetry.py`, or a `survey_nbs.py` module in the style of `survey_regions.py`, and an `elif dataset.startswith('noaa-nbs-')` branch in `main`. For each lake in the dataset:
   - Download or stream each pinned tile through rasterio (the `rasterio.Env` pattern in `build-hrdem-terrain.py`) and check its SHA-256.
   - Mask `NBS Generalization` cells by reading the contributor band and the raster attribute table, together with NoData and above-water values.
   - Mosaic in UTM, convert to positive depth with `depth_from_elevation`, and clip to the lake outline so neighbouring water is not carried.
   - Write one prepared GeoTIFF per lake, then call `TileWriter.add` at `maxZoom` 14 (the tiles are 4 m) and 13 where only 8–16 m tiles exist.
   - Set `title`, `aliases` and `note` on each grid for the directory.
2. **Tests** in `scripts/data-build/test_survey_nbs.py`:
   - filler masking
   - depth sign
   - datum handling
   - clipping to the outline
   - pin mismatch
   - Use a small committed tile fixture cut from a real CC0 NBS tile, and document it in the fixtures README.
3. **Build:**

   ```sh
   /tmp/topostack-surveys-venv/bin/python scripts/data-build/build-survey-bathymetry.py \
     --cache /tmp/topostack-lake-surveys --out-dir /tmp/topostack-survey-archives \
     --dataset noaa-nbs-gulf-lakes-v1
   ```

   Repeat for each dataset. Copy each receipt's digest, size, tile count and grid count into `scripts/data/lake-survey-builds.json`.
4. **Registration** in one commit per dataset:
   - `scripts/data/lake-bathymetry.json`: an entry **after** the existing providers, with the tight box from phase 0, `depth-terrarium-v1` encoding, and the licence "CC0 1.0; acknowledge NOAA Office of Coast Survey".
   - `build-lake-directory.py`: `REGIONS` and `GROUPS`. `noaa*` currently maps to "Great Lakes", so give `noaa-nbs-*` the "United States" group.
   - `apps/generator/src/lib/site/lake-pages.ts`: add the IDs to the `united-states` region.
   - `apps/generator/src/routes/attribution/+page.svelte`: `surveyNotes` for the new IDs.
   - `scripts/data/lake-survey-validation.json`: one live case per dataset.
   - `scripts/verify/verify-lake-outlines.mjs` and `build-lake-outlines.py`, if NBS masks are used as provider outlines. Otherwise the lakes rely on HydroLAKES or OSM outlines.
5. **Regenerate** the directory and outline release, because `lake-outlines-release.json` pins `lake-survey-sources.json` and the directory:

   ```sh
   /tmp/topostack-surveys-venv/bin/python scripts/data-build/build-lake-directory.py \
     --cache /tmp/topostack-lake-surveys --archives /tmp/topostack-survey-archives
   ```

   Then rebuild the lake outlines as described in [lake-bathymetry.md](lake-bathymetry.md).
6. **Tests and budgets:**
   - `lake-directory.test.ts`: sources equal registry order, and build counts match.
   - `lake-pages.test.ts`: region totals.
   - `bathymetry.test.ts`: registry mocks.
   - `worker.test.ts`: optionally add the new IDs to the archive `describe.each`.
   - Directory budget: `lakeDirectoryGzip` is 340,000 bytes against 306,268 measured. About 40 lakes add very little, but confirm with `npm run build && npm run budget:web`.
7. **Verify and provision:**

   ```sh
   npm run typecheck && npm run lint && npm test && npm run test:python
   npm run build && npm run budget:web
   VITE_MAP_API_PORT=8893 TOPOSTACK_WEB_PORT=5293 npm run dev
   node scripts/verify/verify-surveys-live.mjs --dataset=noaa-nbs-gulf-lakes-v1 \
     --local-archives=/tmp/topostack-survey-archives
   node --env-file=.env scripts/provision/provision-lake-data.mjs \
     /tmp/topostack-survey-archives/noaa-nbs-gulf-lakes-v1.pmtiles \
     --source=noaa-nbs-gulf-lakes-v1 --provision --expected-sha256=<receipt sha256>
   ```

8. **Docs and changelog:**
   - Add a source table row in `lake-bathymetry.md`.
   - Add a changelog fragment (`npm run changelog:new`) for makers, for example "Depths for 30+ more US lakes, including Lake Washington, Pend Oreille and Lake Pontchartrain".

Exit: one PR per dataset, or one for all five. Production provisioning uses `--prod` with the pinned digests.

## Phase 3: Great Lakes at 4–16 m (decision needed)

NBS covers the six Great Lakes with 4–16 m tiles. The open-lake depths are the same 1948 soundings as the NCEI grid, but harbours and nearshore areas use modern surveys.

- Dataset `noaa-nbs-great-lakes-v1`, placed **before** `noaa-great-lakes-v1`, which remains as fallback. Reuse the phase 2 builder, with Low Water Datum (IGLD85) references per lake.
- Generalise `hasNoaaCoverage` in `apps/generator/src/lib/domain/bathymetry.ts`. Today only `noaa-great-lakes-v1` gets the HydroLAKES ID gate; move `hylakIds` into a per-dataset field so both datasets use it.
- The archive is large: over 1,700 NBS tiles at 4–16 m (Superior 542, Michigan 722, Erie 245, Ontario 145, St. Clair 41, plus Huron). Measure the build, and keep `maxZoom` at 13 unless the 24-tile browser limit and archive size allow 14.
- Update the tests that assert six NOAA lakes and NOAA-first order: `lake-directory.test.ts`, `bathymetry.test.ts` and the fixtures README. Extend `verify-noaa-live.mjs` so it checks the new dataset first and falls back when it is blocked.

Decide first whether the finer shoreline detail is worth a larger archive over the same open-lake data.

## Phase 4: chart-only lakes from ENC contours

This covers Champlain, Mead and Okeechobee, the New York canal lakes (Oneida, Cayuga, Seneca, Onondaga, Cross), the Rainy/Namakan/Kabetogama/Sand Point/Crane/Lac la Croix chain, and Grand/White/Arthur lakes in Louisiana.

1. **Spike (read-only).** Download the ENC cells covering Lake Champlain and read `DEPCNT` (`VALDCO`), `SOUNDG` and `DEPARE` with fiona's S-57 driver:
   - `OGR_S57_OPTIONS=SPLIT_MULTIPOINT=ON,ADD_SOUNDG_DEPTH=ON`.
   - Confirm the depth units, the chart datum, and that contours are dense enough to interpolate.
   - The pinned fiona wheel has the S-57 driver, so no extra GDAL install is needed.
2. **Builder.** Add an `enc()` handler that feeds contours and soundings into `survey_regions.contour_grid`:
   - linear interpolation, no extrapolation, masked by `DEPARE` polygons clipped to the lake outline.
   - ENC depths are already metres below chart datum, and each lake's pin records that datum as its `surface` (phase 1 rules).
3. **Datasets:** regional IDs such as `noaa-enc-northeast-lakes-v1`, `noaa-enc-voyageurs-v1`, `noaa-enc-southwest-v1` and `noaa-enc-florida-v1`.
   - They follow the phase 2 registration, directory, test and provisioning steps.
   - Their priority comes after NBS and after the existing providers. Tahoe stays on USGS.
4. **Pinning:** ENC cells are reissued weekly, so pin the cell files by edition and SHA-256 and record the edition date in the note.

## Out of scope

- CUDEM-only lakes (Mattamuskeet).
- Lakes whose CUDEM tiles appear flattened.
- Lakes with no NOAA data. The report lists them; they stay on HydroLAKES/GLOBathy models or depth-chart tracing.
