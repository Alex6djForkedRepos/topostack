# NOAA lake depth coverage, 2026-09-24

Which lakes NOAA can supply depths for, beyond the six in `noaa-great-lakes-v1`. Probe results for every lake below are in [data/noaa-lake-coverage-20260924.json](data/noaa-lake-coverage-20260924.json).

## Summary

- **NCEI Great Lakes Bathymetry**, the product TopoStack uses, covers only Superior (still a draft), Michigan, Huron, Erie, Ontario and St. Clair. It contains nothing else, so there are no more lakes to take from it.
- **More NOAA coverage comes from three other products:**
  - **National Bathymetric Source (NBS) Modeling:** the most useful. Numeric 4–16 m grids in the public bucket `noaa-ocs-nationalbathymetry-pds`, built from measured surveys, CC0 per source. They cover 32 lakes and reservoirs beyond the Great Lakes, plus the Great Lakes themselves at much finer resolution than the 3″ (~90 m) NCEI grids.
  - **BlueTopo:** a subset of the same Gulf and Florida lakes.
  - **NCEI CUDEM 1/9″:** also covers the Gulf lakes, Lake Washington and Lake Union.
- **About 20 more lakes have depths only on NOAA nautical charts.** All paper charts were retired by January 2025; the ENC (electronic chart) cells that replaced them carry depth contours and soundings in metres. They would need the contour-to-grid path already used for Ontario and Minnesota.
- **Many well-known US lakes have no NOAA depth data at all**, including Okeechobee, Champlain (except shallow margins), Tahoe (already covered by USGS), Mead, Lake of the Woods and Crater Lake.

## How this was checked

- `www.ncei.noaa.gov` and `www.charts.noaa.gov` were unreachable from the research environment.
- **Gridded products:** the NBS tile schemes and CUDEM listings were read from the public AWS buckets on 2026-09-24. Each lake was sampled at one open-water point by reading the actual GeoTIFF tile over HTTP.
- **Chart coverage:** comes from chart titles on vendor and mirror sites, gathered through web search. The ENC cell names were not checked.

A lake counts as **confirmed** below only when a tile returned plausible lake-floor values. "Tile present" means a tile covers the probe point, but the depths read belong to a neighbouring Great Lake, so it is unclear whether the inland lake itself has data.

## 1. Already integrated (NCEI 3″ grids)

Superior (draft), Michigan, Huron, Erie, Ontario, St. Clair.

NBS Modeling covers all six at 4–16 m (Superior 542 tiles, Michigan 722, Erie 245, Ontario 145, St. Clair 41). The open-lake Superior and Winnebago tiles cite 1948 US Lake Survey soundings (`L0xxxx`), interpolated. These are finer grids of old data, not newer surveys.

## 2. NOAA numeric grids, confirmed by sampling

Depths are NBS band-1 elevations (negative is below the water) or CUDEM NAVD88 elevations. They are not yet referenced to a lake surface.

| Lake | State | Product(s) | Resolution | Sampled | Notes |
| --- | --- | --- | --- | --- | --- |
| Lake Washington | WA | Modeling, CUDEM 2023v1 | 4 m / ~3 m | −56 m point, −67 m tile | H11810 multibeam, H11293, H11376, H02609 |
| Lake Union | WA | Modeling, CUDEM 2023v1 | 4 m | −12 m point, −32 m tile | same chart area as Lake Washington |
| Lake Pend Oreille | ID | Modeling | 4 m | −342 m tile | matches the lake's ~350 m maximum |
| Franklin D. Roosevelt Lake | WA | Modeling | 4 m | −122 m (south), −48 m (north) | about 61 tiles from 1948–49 surveys; sparse valid cells |
| Lake Bonneville (Columbia) | OR/WA | Modeling | 4 m | −43 m tile | river reservoir |
| Lake Celilo (Columbia) | OR/WA | Modeling | 4 m | −44 m tile | river reservoir |
| Lake Umatilla (Columbia) | OR/WA | Modeling | 4 m | −28 m tile | river reservoir |
| Lake Wallula (Columbia) | OR/WA | Modeling | 4 m | −37 m tile | river reservoir |
| Lake Sacajawea (Snake) | WA | Modeling | 4 m | −24 m tile | river reservoir |
| Lake Herbert G. West (Snake) | WA | Modeling | 4 m | −15 m tile | river reservoir |
| Lake Bryan (Snake) | WA | Modeling | 4 m | −20 m tile | river reservoir |
| Lower Granite Lake (Snake) | WA/ID | Modeling | 4 m | −25 m tile | river reservoir |
| Lake Winnebago | WI | Modeling | 4 m | −5.8 m, 96% valid | 1948 US Lake Survey (L02186/L02188) plus the chart 14916 ENC |
| Portage Lake (Onekama) | MI | Modeling | 4 m | −14 m point, −17 m tile | |
| Muskegon Lake | MI | Modeling | 4 m | −11 m point, −24 m tile | |
| White Lake | MI | Modeling | 4 m | −21 m tile | |
| Spring Lake | MI | Modeling | 4 m | −7.6 m point, −12 m tile | |
| Lake Macatawa | MI | Modeling | 4 m | −4.3 m point, −7.7 m tile | |
| Manistee Lake | MI | Modeling | 4 m | −15 m tile | |
| Lake George (St. Johns) | FL | Modeling, BlueTopo | 4 m | −3.4 m point | partly built from charts |
| Lake Dexter | FL | Modeling, BlueTopo | 8 m | −9.7 m tile | sparse |
| Lake Monroe | FL | Modeling, BlueTopo | 8 m | −2.0 m point | sparse |
| Lake Harney | FL | Modeling, BlueTopo | 8 m | −1.8 m point | sparse |
| Crescent Lake | FL | Modeling, BlueTopo | 4 m | −3.9 m point | |
| Lake Worth Lagoon | FL | Modeling, BlueTopo | 4 m | −15 m tile | tidal lagoon; HydroLAKES may not list it |
| Lake Wimico | FL | Modeling, BlueTopo | 8 m | −23 m tile | tile depth may include the ICW channel |
| Lake Pontchartrain | LA | Modeling, BlueTopo, CUDEM 2020v1 | 4 m / ~3 m | −4.8 m point | 94% valid |
| Lake Maurepas | LA | Modeling, BlueTopo, CUDEM 2020v1 | 4 m | −3.7 m point | 94% valid |
| Lake Borgne | LA/MS | Modeling, BlueTopo, CUDEM 2020v1 | 8 m | −3.2 m point | brackish lagoon |
| Lake Salvador | LA | Modeling | 4 m | −2.4 m point | CUDEM reads −0.1 m (flattened) |
| Sabine Lake | TX/LA | Modeling, BlueTopo, CUDEM 2021v2 | 4 m | −2.3 m point | |
| Calcasieu Lake | LA | Modeling, BlueTopo, CUDEM 2021v1 | 4 m | −2.0 m point | the −14 m tile minimum is the ship channel |
| Lake Mattamuskeet | NC | CUDEM 2018v1 | ~3 m | −1.1 m NAVD88 | plausible for a ~1 m lake; bed shape not checked |

## 3. Tile present, lake not confirmed

These probe points fall in a 16 m Great Lakes tile whose depths come from the neighbouring Great Lake. Whether the inland lake itself has data needs a closer look:

- Lake Charlevoix (MI)
- Portage Lake and Torch Lake on the Keweenaw Waterway (MI)
- Pere Marquette Lake (MI)
- On the St. Marys River: Munuscong Lake, Lake George and Lake Nicolet (MI/ON)

CUDEM also has tiles over these lakes, but they are not usable:

- **Grand Lake and White Lake (LA):** read −0.1 m, which looks like a flattened water surface.
- **Lake Drummond (VA):** reads +4.4 m, a water surface.
- **Lake Sammamish (WA):** reads +1.5 m, not bathymetry.

## 4. Nautical charts only (no NOAA grid found)

All of these charts were cancelled when NOAA retired paper and raster charts (completed December 2024 to January 2025). The ENCs that replace them should hold the same depth contours and soundings, but the cell names were not checked.

| Lake | State | Former chart(s) |
| --- | --- | --- |
| Lake Champlain | NY/VT/QC | 14781–14785 (NWS Burlington hosts PDFs). NGS Finger Lakes 2019 lidar covers the northern margins to ~6 m only. |
| Lake Tahoe | CA/NV | 18665. Already covered by the USGS DDS-55 grid; NCEI holds only the raw 1998 multibeam. |
| Lake Mead | NV/AZ | 18687 (2002 edition; depths predate the current low water) |
| Lake Okeechobee | FL | 11428 |
| Oneida Lake | NY | 14788 and the 14786 canal book |
| Cayuga Lake, Seneca Lake | NY | 14791 and the 14786 canal book. NGS lidar covers only margins shallower than ~5 m. |
| Onondaga Lake, Cross Lake | NY | 14786 canal book |
| Rainy Lake | MN/ON | 14996–14998 (mainly the US side) |
| Namakan Lake, Kabetogama Lake | MN/ON | 14993–14995 |
| Sand Point, Crane, Little Vermilion lakes; Lac la Croix | MN/ON | 14992 |
| Grand Lake, White Lake, Lake Arthur (Mermentau) | LA | 11348 |

Possible but unconfirmed chart coverage:

| Lake(s) | Possible chart(s) |
| --- | --- |
| Lake Salvador, Lake Cataouatche | 11365, 11367 |
| Grand Lake and Six Mile Lake (Atchafalaya) | 11354 |
| Clear Lake and Taylor Lake (TX) | 11327 |
| Pentwater, Betsie and Arcadia lakes | 14907 insets |
| Kalamazoo Lake | 14906 |
| Big Lake Butte des Morts and Lake Poygan | not on the Lower Fox chart 14916 |

## 5. No NOAA depth data found

The following were probed against NBS and CUDEM, and searched for a chart:

- **Northern states:** Lake of the Woods (Canadian CHS chart 6201 only), Lake St. Lawrence, Mille Lacs, Lake Sakakawea, Lake Pepin
- **Western states:** Crater Lake, Flathead, Coeur d'Alene, Lake Chelan, Clear Lake (CA), Salton Sea, Great Salt Lake, Utah Lake, Lake Powell, Lake Havasu, Lake Mohave
- **Southern states:** Lake Texoma, Lake Marion, Lake Moultrie, Kentucky Lake, Lake Lanier, Lake Seminole, West Point Lake
- **Alaska:** Iliamna

NOAA-hosted USACE topobathy lidar exists for Lake Seminole and West Point Lake, but lidar reaches only shallow margins.

## Using NBS Modeling tiles

- **Format:** three-band COGs (elevation, uncertainty, contributor) with a raster attribute table per source. Each tile's GeoTIFF URL and SHA-256 are listed in the dated tile-scheme GeoPackage.
- **Status:** the product sits under `Test-and-Evaluation/`. Tile names and dates change between releases, so pin the scheme file and the tile digests.
- **Filler cells:** every source row carries `license_name: cc0-1.0`. Rows with `source_survey_id: NBS Generalization` (dated 1807-02-10, `data_assessment: 3`) are a generalized fill, not measurements. Mask them out the way land and NoData are masked today.
- **Vertical reference:** not stated in the tile. Lake Washington sources are named `…_MLLW`, and the Great Lakes sources are US Lake Survey sheets. Establish each lake's reference before anchoring depths to the HydroLAKES waterline, as `noaa-bathymetry.md` does for the low-water datum.
- **Interpolated cells:** many cells are flagged `.interpolated` or `.upsampled` from sparse 1940s soundings. A 4 m grid does not mean 4 m survey density.

## Suggested next steps

1. **Add an NBS Modeling builder for the confirmed inland lakes in section 2**, as a new versioned dataset rather than a change to `noaa-great-lakes-v1`. It would:
   - pin the scheme GeoPackage and each tile's SHA-256
   - drop the NBS Generalization cells
   - mask to HydroLAKES or provider outlines
2. **Decide separately whether to replace the Great Lakes 3″ grids with the NBS 4–16 m tiles.** That is a new dataset version under the rules in `noaa-bathymetry.md`.
3. **Treat ENC depth contours as a contour source** for the chart-only lakes in section 4, starting with Champlain, Mead and Okeechobee, using the existing contour interpolation.
4. **Allow `www.ncei.noaa.gov`, `www.charts.noaa.gov` and `noaa-ocs-nationalbathymetry-pds.s3.amazonaws.com`** in the build environment so these checks can be repeated with direct downloads.
