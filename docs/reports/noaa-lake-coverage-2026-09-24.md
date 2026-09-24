# NOAA lake depth coverage, 2026-09-24

Which lakes NOAA can supply depths for, beyond the six in `noaa-great-lakes-v1`. Probe results for every lake below are in [data/noaa-lake-coverage-20260924.json](data/noaa-lake-coverage-20260924.json).

## Summary

- **NCEI Great Lakes Bathymetry**, the product TopoStack uses, covers only Superior (still a draft), Michigan, Huron, Erie, Ontario and St. Clair. It contains nothing else, so there are no more lakes to take from it.
- **More NOAA coverage comes from three other products:**
  - **National Bathymetric Source (NBS) Modeling:** the most useful. Numeric 4–16 m grids in the public bucket `noaa-ocs-nationalbathymetry-pds`, built from measured surveys. Most sources are CC0 or CC-BY 4.0; a few are non-commercial, internal-use or pending and must be excluded (see the correction below). Measured against every HydroLAKES polygon, 503 lakes are at least half surveyed, most of them small coastal ponds and lagoons; 19 named lakes beyond the Great Lakes are confirmed in section 2. NBS also covers the Great Lakes themselves at much finer resolution than the 3″ (~90 m) NCEI grids.
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

**Surveyed** is the share of the lake that NBS fills from measured surveys with an open licence, from the canonical HydroLAKES inventory (see the correction at the end). Where HydroLAKES has no polygon for the lake, it is the survey share of the water cells in the tile over the probe point, marked *tile*.

| Lake | State | Product(s) | Resolution | Sampled | Surveyed | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Lake Washington | WA | Modeling, CUDEM 2023v1 | 4 m / ~3 m | −56 m point, −67 m tile | 100% | H11810 multibeam, H11293, H11376, H02609 |
| Lake Union | WA | Modeling, CUDEM 2023v1 | 4 m | −12 m point, −32 m tile | 98% | same chart area as Lake Washington |
| Lake Pend Oreille | ID | Modeling | 4 m | −342 m tile | 87% | matches the lake's ~350 m maximum |
| Franklin D. Roosevelt Lake | WA | Modeling | 4 m | −122 m (south), −48 m (north) | 98% | about 61 tiles from 1947–49 surveys |
| Lake Bonneville (Columbia) | OR/WA | Modeling | 4 m | −43 m tile | 80% *tile* | river reservoir; not a HydroLAKES polygon |
| Lake Winnebago | WI | Modeling | 4 m | −5.8 m, 96% valid | 79% | 1948 US Lake Survey (L02186/L02188) plus the chart 14916 ENC |
| Muskegon Lake | MI | Modeling | 4 m | −11 m point, −24 m tile | 74% | |
| Lake George (St. Johns) | FL | Modeling, BlueTopo | 4 m | −3.4 m point | 90% | |
| Lake Dexter | FL | Modeling, BlueTopo | 8 m | −9.7 m tile | 92% | |
| Lake Monroe | FL | Modeling, BlueTopo | 8 m | −2.0 m point | 97% | |
| Lake Harney | FL | Modeling, BlueTopo | 8 m | −1.8 m point | 84% | |
| Crescent Lake | FL | Modeling, BlueTopo | 4 m | −3.9 m point | 95% | |
| Lake Worth Lagoon | FL | Modeling, BlueTopo | 4 m | −15 m tile | 83% *tile* | tidal lagoon; not a HydroLAKES polygon |
| Lake Wimico | FL | Modeling, BlueTopo | 8 m | −23 m tile | 98% *tile* | not a HydroLAKES polygon; the tile also holds the ICW channel, so the lake's own share is unverified |
| Lake Pontchartrain | LA | Modeling, BlueTopo, CUDEM 2020v1 | 4 m / ~3 m | −4.8 m point | 51% | the rest is NBS fill |
| Lake Maurepas | LA | Modeling, BlueTopo, CUDEM 2020v1 | 4 m | −3.7 m point | 94% | |
| Lake Borgne | LA/MS | Modeling, BlueTopo, CUDEM 2020v1 | 8 m | −3.2 m point | 82% *tile* | brackish lagoon; not a HydroLAKES polygon |
| Sabine Lake | TX/LA | Modeling, BlueTopo, CUDEM 2021v2 | 4 m | −2.3 m point | 58% | the rest is NBS fill |
| Calcasieu Lake | LA | Modeling, BlueTopo, CUDEM 2021v1 | 4 m | −2.0 m point | 87% | the −14 m tile minimum is the ship channel |
| Lake Mattamuskeet | NC | CUDEM 2018v1 | ~3 m | −1.1 m NAVD88 | none in NBS | plausible for a ~1 m lake; bed shape not checked |

These lakes were in this table before the canonical inventory, but the depths sampled for them were NBS Generalization fill, not surveys:

| Lake | State | Surveyed | Why it was listed |
| --- | --- | --- | --- |
| Portage Lake (Onekama) | MI | 0% at the probe | HydroLAKES merges it into Lake Michigan; a 500 m window at the probe is all fill |
| White Lake | MI | 1% | the tile's depths are fill |
| Spring Lake | MI | 3% | the −7.6 m point is fill |
| Lake Macatawa | MI | 11% | the −4.3 m point is fill |
| Manistee Lake | MI | 0% | the tile's depths are fill |
| Lake Celilo (Columbia) | OR/WA | 16% *tile* | river reservoir; mostly fill |
| Lake Umatilla (Columbia) | OR/WA | 18% *tile* | river reservoir; mostly fill |
| Lake Wallula (Columbia) | OR/WA | 4% *tile* | river reservoir; mostly fill |
| Lake Sacajawea (Snake) | WA | 9% *tile* | river reservoir; mostly fill |
| Lake Herbert G. West (Snake) | WA | 11% *tile* | river reservoir; mostly fill |
| Lake Bryan (Snake) | WA | 12% *tile* | river reservoir; mostly fill |
| Lower Granite Lake (Snake) | WA/ID | 10% *tile* | river reservoir; mostly fill |

## 3. Tile present, lake not usable

These lakes lie inside delivered NBS tiles, but the canonical inventory found almost no survey cells in them; the depths first read here came from the neighbouring Great Lake or from NBS fill:

- Lake Charlevoix (MI): 1% surveyed
- Portage Lake and Torch Lake on the Keweenaw Waterway (MI): 2% surveyed (one HydroLAKES polygon)
- Pere Marquette Lake (MI): 11% surveyed
- Mullett and Burt lakes (MI): fill only
- On the St. Marys River: Munuscong Lake, Lake George and Lake Nicolet (MI/ON). HydroLAKES merges them into Lake Huron, so they cannot be measured separately; the Natural Earth preview put the river at 20% surveyed.
- Lake Salvador (LA): 0% surveyed, 84% fill
- Grand Lake (Mermentau, LA): no delivered tile

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

## Correction after the full tile scan

The phase 0 inventory later on 2026-09-24 read the attribute table of all 12,140 delivered Modeling tiles (scheme `Modeling_Tile_Scheme_20260923_175019.gpkg`, none unreadable) and measured every HydroLAKES v1.0 polygon they meet. See [data/nbs-inventory-hydrolakes-20260924.json](data/nbs-inventory-hydrolakes-20260924.json), which lists the 803 lakes with at least 5% surveyed. It changes three things above:

- **Licences are mixed.** Tiles by licence: 12,109 carry CC0 sources and 1,350 carry CC-BY 4.0 sources (a tile can carry both). Another 65 tiles include sources that are not open: 51 have a blank `license_name`, and 14 are licensed CC-BY-NC 4.0, internal use (`IUO-rel-HSD`) or `Pending`. Those source cells must be excluded, and CC-BY sources need attribution.
- **Several "confirmed" lakes were fill.** The one-point probes read NBS Generalization cells for five Michigan harbour lakes and seven Columbia and Snake pools, and the Lake Salvador point was fill as well. They are moved out of section 2 (see the second table there and section 3).
- **Far more small lakes are covered than the named list shows.** 5,965 HydroLAKES polygons meet a delivered tile; 503 are at least half surveyed and 304 at least 90%. By region: Florida 141, Gulf coast 102, Atlantic coast 98, Great Lakes basin 97, Pacific coast 43, Alaska 20, Pacific Northwest inland 2. 311 of the 503 sit at or below 2 m elevation, so they are coastal ponds and lagoons, often tidal. HydroLAKES names only 14 of them.

What the inventory cannot see:

- **Lakes HydroLAKES does not outline.** The Columbia and Snake pools, Lake Worth Lagoon, Lake Wimico and Lake Borgne have no polygon of their own; their shares in section 2 are per tile. A builder for them needs OSM or NHD outlines.
- **Lake Huron** is only 40% surveyed by area, because NBS delivers tiles only over the US half (footprint 0.48).
- **BlueTopo** tile bounds meet 4,773 HydroLAKES polygons, and every one of them also meets a Modeling tile, so BlueTopo adds no lake. Its coverage was not measured.

## Using NBS Modeling tiles

- **Format:** three-band COGs (elevation, uncertainty, contributor) with a raster attribute table per source. Each tile's GeoTIFF URL and SHA-256 are listed in the dated tile-scheme GeoPackage.
- **Status:** the product sits under `Test-and-Evaluation/`. Tile names and dates change between releases, so pin the scheme file and the tile digests.
- **Licences:** not uniform (see the correction above). Filter each source row by `license_name`.
- **Filler cells:** rows with `source_survey_id: NBS Generalization` (dated 1807-02-10, `data_assessment: 3`) are a generalized fill, not measurements. Mask them out the way land and NoData are masked today.
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
