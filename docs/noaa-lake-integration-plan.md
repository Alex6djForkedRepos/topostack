# NOAA lake depth integration plan

How to bring every lake NOAA can supply depths for into the survey data system. The work runs from a local clone. The research behind it is in the [NOAA lake depth coverage report](reports/noaa-lake-coverage-2026-09-24.md).

Each phase ends in its own pull request to `dev`. Stop at the end of any phase and the app is still consistent: the data is either not registered yet, or registered, built, provisioned and tested.

## Status, 2026-09-24

- **Phases 0–2 are done** for NBS Modeling, and were adjusted on the way:
  - The pins are in `scripts/data/noaa-nbs-sources.json` (scheme `Modeling_Tile_Scheme_20260924_113421.gpkg`; NOAA replaced the morning's scheme during the work).
  - Phase 1's per-lake surface records became one rule: depth below the surveys' chart datum, anchored to the waterline like `noaa-great-lakes-v1`, and a lake is refused when more than a quarter of its surveyed bed lies above that datum. That refused 261 of 498 candidates, mostly perched inland lakes whose NBS cells are shoreline or lake-surface elevations, not bed.
  - Phase 2 shipped nine regional datasets rather than the five sketched below, with 237 lakes. The builder, tests and runbook are described in [lake-bathymetry.md](lake-bathymetry.md#noaa-national-bathymetric-source-lakes).
- **Provisioning** of the nine archives to R2 is the remaining step before the registry change can deploy.
- **Not started:** phase 3 (Great Lakes at 4–16 m) and phase 4 (ENC contours for chart-only lakes such as Champlain, Mead and Okeechobee). NOAA has no depth data for Kentucky or Tennessee reservoirs; those need another source.

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

**Done:**

- `scripts/data-build/nbs_inventory.py` is in place, with tests. For every delivered tile it:
  - records the scheme digest and each tile's published SHA-256
  - checks each attribute table against its published digest
  - classifies cells as `survey`, `chart` (digitized from an ENC), `restricted` (a non-open licence) or `generalization` (modelled fill)
- With `--lakes` it matches lake polygons to tiles. With `--measure` it estimates each lake's share of each kind.
- The canonical run against every HydroLAKES polygon is summarised in [data/nbs-inventory-hydrolakes-20260924.json](reports/data/nbs-inventory-hydrolakes-20260924.json) and the [report correction](reports/noaa-lake-coverage-2026-09-24.md#correction-after-the-full-tile-scan).
  - It read 12,140 tiles with none unreadable, and measured the 5,965 HydroLAKES lakes they meet in about 13 minutes.
  - 503 lakes are at least half surveyed, most of them small coastal ponds and lagoons.
  - Licences are mixed, and 51 tiles carry sources with a blank licence, so a builder must filter per source.
  - The Michigan harbour lakes other than Muskegon, and the Columbia and Snake pools other than Bonneville, are NBS fill, not survey.

**What the scan showed about NOAA's data**, which shapes everything below:

- **No history is kept.** NOAA keeps only the current tile scheme and one version of each tile, and re-delivered about 10,000 tiles in September 2026. Pinned tiles will disappear.
  - A build therefore downloads each pinned tile into the cache and checks its SHA-256.
  - Keep that cache, or copy the pinned tiles to R2 under `sources/nbs/`, so a released archive can be rebuilt.
  - A mismatch fails the build. It is resolved by re-running the inventory and reviewing the changed tiles, never by skipping the check.
- **Where pins go.** `lake-outlines-release.json` pins the SHA-256 of `lake-survey-sources.json`, so editing that file forces a lake outline release. Keep NBS pins in a separate `scripts/data/noaa-nbs-sources.json` until phase 2 registers the datasets.

**Remaining:**

1. To repeat the canonical inventory (HydroLAKES v1.0 from `data.hydrosheds.org`, as in `build-lake-data.mjs`):

   ```sh
   /tmp/topostack-surveys-venv/bin/python scripts/data-build/nbs_inventory.py \
     --cache /tmp/topostack-nbs --out /tmp/topostack-nbs/nbs-inventory.json \
     --lakes /path/to/HydroLAKES_polys_v10.shp --min-area-km2 0 --measure
   ```

   The defaults read the HydroLAKES fields `Hylak_id`, `Lake_name` and `Lake_area`. Only lakes that meet a delivered tile are measured, so no regional filter is needed.
2. Choose the lakes to ship:
   - `surveyedShare` (footprint × survey share) of at least about 0.5 is the working threshold.
   - Decide whether the ~490 small, mostly unnamed coastal ponds and lagoons are worth shipping, or only the named lakes. Many are tidal, which phase 1 must reference to MLLW.
   - Lakes without a HydroLAKES polygon (Lake Bonneville, Lake Worth Lagoon, Lake Wimico, Lake Borgne) need OSM or NHD outlines, or are dropped.
   - The Great Lakes-adjacent lakes are settled: Charlevoix, Keweenaw, Pere Marquette, Mullett and Burt are fill; HydroLAKES merges the St. Marys lakes into Huron and the Winnebago Pool lakes (Butte des Morts, Poygan) into Winnebago.

   Regional grouping for the named lakes:

   | Dataset ID | Lakes | Bounding box (approx.) |
   | --- | --- | --- |
   | `noaa-nbs-pacific-northwest-v1` | Washington, Union, Pend Oreille, Lake Roosevelt, Bonneville | −123, 45.5, −116, 49 |
   | `noaa-nbs-wisconsin-v1` | Winnebago (with the Winnebago Pool lakes) | −88.95, 43.75, −88.3, 44.3 |
   | `noaa-nbs-muskegon-v1` | Muskegon; or fold it into a Great Lakes inland dataset if more harbour lakes qualify | −86.35, 43.2, −86.2, 43.27 |
   | `noaa-nbs-florida-v1` | George, Dexter, Monroe, Harney, Crescent, Lake Worth Lagoon, Wimico | −85.5, 26.5, −80, 29.6 |
   | `noaa-nbs-gulf-lakes-v1` | Pontchartrain, Maurepas, Borgne, Sabine, Calcasieu | −94, 29.5, −89.5, 30.5 |

3. Write the selected tiles to `scripts/data/noaa-nbs-sources.json`:
   - the scheme key and SHA-256
   - per lake: HydroLAKES ID, name, and tiles with `tile`, `url`, `sha256` and `resolution`
   - the survey kinds and licences to keep

Exit: the pins and inventory report are merged. No registry change, so nothing reaches users.

## Phase 1: surface references (per lake)

Every NBS elevation is relative to the sources' chart datum or water-level surface. That is `MLLW` for tidal lakes. For Lake Washington, the Great Lakes and river pools it has to be established per lake.

For each lake, record in its pin:

- **`surface`:** the reference level the grid's zero corresponds to, with its source. Candidates:
  - the NOAA station datum page, for tidal lakes
  - the USACE pool elevation, for Lake Bonneville and other river reservoirs
  - Low Water Datum (IGLD85), for Great Lakes-connected lakes
  - the chart datum printed on the lake's chart
- **`surfaceNote`:** the vertical-reference note shown in the directory, like the reservoir `verticalReference`.

Depth is then `-elevation` below that datum, and the browser anchors it to the terrain waterline, as it does for `noaa-great-lakes-v1`. A lake whose reference cannot be established is dropped from the phase 2 build and listed in the builds `skipped` list with the reason.

## Phase 2: NBS inland lakes

1. **Builder.** Add an `nbs()` handler to `build-survey-bathymetry.py`, or a `survey_nbs.py` module in the style of `survey_regions.py`, and an `elif dataset.startswith('noaa-nbs-')` branch in `main`. For each lake in the dataset:
   - Download or stream each pinned tile through rasterio (the `rasterio.Env` pattern in `build-hrdem-terrain.py`) and check its SHA-256.
   - Keep only cells whose contributor is a `survey` source with an open licence, using `nbs_inventory.parse_rat`. Mask `generalization`, `restricted` and `chart` cells, together with NoData and above-water values.
   - Mosaic in UTM, convert to positive depth with `depth_from_elevation`, and clip to the lake outline so neighbouring water is not carried.
   - Write one prepared GeoTIFF per lake, then call `TileWriter.add` at `maxZoom` 14 (the tiles are 4 m) and 13 where only 8–16 m tiles exist.
   - Set `title`, `aliases` and `note` on each grid for the directory.
2. **Tests** in `scripts/data-build/test_survey_nbs.py`:
   - filler masking
   - depth sign
   - datum handling
   - clipping to the outline
   - pin mismatch
   - restricted-licence masking
   - Use a small committed tile fixture cut from a real CC0 NBS tile, and document it in the fixtures README.
3. **Build:**

   ```sh
   /tmp/topostack-surveys-venv/bin/python scripts/data-build/build-survey-bathymetry.py \
     --cache /tmp/topostack-lake-surveys --out-dir /tmp/topostack-survey-archives \
     --dataset noaa-nbs-gulf-lakes-v1
   ```

   Repeat for each dataset. Copy each receipt's digest, size, tile count and grid count into `scripts/data/lake-survey-builds.json`.
4. **Registration** in one commit per dataset:
   - `scripts/data/lake-bathymetry.json`: an entry **after** the existing providers, with the tight box from phase 0, `depth-terrarium-v1` encoding, and the licence "CC0 1.0 and CC BY 4.0 sources; acknowledge NOAA Office of Coast Survey and the listed survey institutions". CC-BY sources need their institutions in the attribution.
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
   - Add a changelog fragment (`npm run changelog:new`) for makers, for example "Depths for about 20 more US lakes, including Lake Washington, Pend Oreille and Lake Pontchartrain".

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
