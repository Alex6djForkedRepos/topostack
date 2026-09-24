# Lakes NOAA nautical charts can supply depths for, 2026-09-24

Every lake in the United States (and border lakes) whose NOAA electronic navigational chart (ENC) cells hold depth contours or soundings inside it. This is the source for plan phase 4 ([integration plan](../noaa-lake-integration-plan.md)); the survey grids already shipped are in the [coverage report](noaa-lake-coverage-2026-09-24.md). Per-lake data, including the cells to use, is in [data/noaa-chart-lakes-20260924.json](data/noaa-chart-lakes-20260924.json).

## Summary

- **186 lakes not yet covered by TopoStack have usable chart depths:** 58 with good detail (tier A), 102 partial (tier B), and 26 with depth bands only (tier C).
- **Large new lakes in tier A:** Lake Okeechobee, Lake Champlain, Lake Mead, Oneida, Seneca, Cayuga, Onondaga and Cross lakes on the New York canals, Burt, Mullett and Charlevoix lakes and the Keweenaw Waterway in Michigan, and the Michigan harbour lakes (White, Manistee, Pere Marquette, Pentwater, Macatawa and others) whose NBS tiles were only fill.
- **New tier A and B lakes by state:** LA 23, MI 23, NY 21, AK 19, FL 18, VA 8, MA 6, NJ 6, TX 4, WA 3, RI 3, WI 3, MD 3, CT 3, MS 2, ME 2, OH 2, Mexico 2, OR 2, NV 1, DE 1, IL 1, AL 1, CA 1, SC 1, NC 1.
- **123 more** have chart depths but are already served: 116 by the NOAA NBS archives, the Great Lakes by NCEI, and Lake Tahoe by USGS.
- **No charts for Kentucky or Tennessee.** No active ENC cell lists either state, so Kentucky Lake, Barkley and the TVA reservoirs cannot come from this source. The same holds for most inland reservoirs: NOAA charts only navigable waters.

## How this was checked

- The ENC product catalog lists each cell's name, title, scale, edition and coverage polygon. Every HydroLAKES polygon in the US, Canada and Mexico was matched to active cell coverage: 148,469 lakes meet some cell, because coverage polygons include land.
- The 3,302 cells meeting a lake (482 MB) were downloaded and read with GDAL's S-57 driver, updates applied. Inside each lake, the check measured:
  - **Charted:** the share of the lake inside depth areas (`DEPARE`) deeper than 0 m.
  - **Contour levels:** distinct depth contours (`DEPCNT`) deeper than 0 m. The 0 m contour is the shoreline.
  - **Soundings:** spot depths (`SOUNDG`) inside the lake, the most in any one cell.
  - **Datum:** the cells' sounding datum. All depths are in metres.
- 3,655 lakes have some charted depth area. Tiers:
  - **A:** at least half charted, 2+ contour levels and 10+ soundings. Enough to interpolate a lake floor with the existing contour grid.
  - **B:** at least a fifth charted, with a contour level or 10+ soundings. Usable with more basin-model fallback.
  - **C:** at least half charted but only depth bands (for example "0–1.8 m"), no floor shape.
  - The other 3,346 have charted depth only along an edge and are not listed.
- Names come from the USGS National Hydrography Dataset and places from Census TIGERweb, as for the NBS lakes. 105 of the new lakes have no name there.

## What to expect from chart depths

- **Chart depths are generalized for navigation.** Soundings are selected to be safe (shoal-biased), and contours are sparse away from channels. Lake Okeechobee, for example, is 91% charted but has only two contour levels. Floors will be smoother and shallower than a survey grid.
- **Datums:** MLLW on tidal water, the IGLD 1985 low-water datum on the Great Lakes and their connected lakes, and a local datum on the New York canal lakes, Pend Oreille and Roosevelt. Depth below datum anchored to the waterline, as for the NBS lakes, fits all three. Lakes perched above their chart datum need the same check the NBS builder applies.
- **Overlapping cells** are normal: each area is charted at several scales. The build should take each lake's most detailed cell first (the "most detailed cell" column) and fill from coarser ones.
- **Cells are reissued weekly**, so a build must pin each cell by edition and SHA-256.

## Tier A: good detail, not yet covered (58)

| Lake | State | Area km² | Charted | Contour levels | Soundings | Max charted m | Datum | Most detailed cell | Already covered |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Unnamed lake, Aleutians West Census Area | AK | 8.3 | 97% | 3 | 46 | 25.6 | MLLW | `US4AK2DF` 1:45,000 |  |
| Unnamed lake, Ketchikan Gateway Borough | AK | 7.0 | 98% | 3 | 20 | 133.5 | MLLW | `US4AK5GQ` 1:45,000 |  |
| Lake McDonald | AK | 4.2 | 81% | 2 | 33 | 115.2 | MLLW | `US4AK5JO` 1:45,000 |  |
| Unnamed lake, Sitka City and Borough | AK | 0.8 | 100% | 3 | 45 | 71.3 | MLLW | `US5AK2EI` 1:22,000 |  |
| Lake Okeechobee | FL | 1,418.8 | 91% | 2 | 582 | 4.2 | MLLW | `US4FL2EF` 1:45,000 |  |
| Blackwater Sound | FL | 32.0 | 100% | 2 | 133 | 2.6 | MLLW | `US5FL5GK` 1:12,000 |  |
| Unnamed lake, Broward County | FL | 0.1 | 100% | 4 | 24 | 9.1 | MLLW | `US5PEFBA` 1:12,000 |  |
| Lake Salvador | LA | 386.5 | 77% | 5 | 48 | 5.7 | MLLW | `US5LA2CU` 1:12,000 |  |
| Little Lake | LA | 56.7 | 83% | 3 | 127 | 8.0 | MLLW | `US5FOCCB` 1:12,000 |  |
| Lake Saint Catherine | LA | 25.6 | 100% | 5 | 84 | 5.0 | MLLW | `US5LA3DF` 1:12,000 |  |
| Unnamed lake, Lafourche Parish | LA | 10.7 | 63% | 3 | 23 | 7.9 | MLLW | `US5FOCCB` 1:12,000 |  |
| Unnamed lake, St. Martin Parish | LA | 9.6 | 99% | 4 | 15 | 15.8 | MLLW | `US5LMOIF` 1:22,000 |  |
| Lake Tashmoo | MA | 1.0 | 85% | 2 | 55 | 3.1 | MLLW | `US5MA1DK` 1:12,000 |  |
| Unnamed lake, Norfolk County | MA | 0.8 | 100% | 3 | 16 | 10.0 | MLLW | `US5MA1OF` 1:22,000 |  |
| Unnamed lake, Plymouth County | MA | 0.7 | 95% | 3 | 11 | 7.3 | MLLW | `US5MA1NJ` 1:12,000 |  |
| Unnamed lake, Norfolk County | MA | 0.4 | 100% | 2 | 13 | 5.4 | MLLW | `US5BOSBE` 1:22,000 |  |
| Salt Pond | ME | 2.3 | 96% | 2 | 23 | 15.8 | MLLW | `US5ME2GH` 1:22,000 |  |
| Unnamed lake, Lincoln County | ME | 1.6 | 98% | 3 | 15 | 21.9 | MLLW | `US5ME1KQ` 1:12,000 |  |
| Burt Lake | MI | 69.1 | 100% | 3 | 224 | 22.2 | IGLD 1985 | `US5MI7MG` 1:12,000 |  |
| Lake Charlevoix | MI | 68.4 | 99% | 3 | 297 | 37.1 | IGLD 1985 | `US5MI2WW` 1:12,000 |  |
| Mullett Lake | MI | 67.1 | 99% | 3 | 341 | 36.5 | IGLD 1985 | `US5MI7KH` 1:12,000 |  |
| Portage Lake | MI | 47.4 | 98% | 4 | 209 | 37.4 | IGLD 1985 | `US5MI6QC` 1:12,000 |  |
| White Lake | MI | 9.8 | 98% | 3 | 622 | 21.6 | IGLD 1985 | `US5MI1WH` 1:12,000 |  |
| Unnamed lake, Emmet County | MI | 9.1 | 99% | 3 | 257 | 18.5 | IGLD 1985 | `US5MI7KE` 1:12,000 |  |
| Lake Macatawa | MI | 6.4 | 99% | 5 | 255 | 10.9 | IGLD 1985 | `US5MI1OJ` 1:12,000 |  |
| Lac La Belle | MI | 4.5 | 99% | 3 | 129 | 11.2 | IGLD 1985 | `US5MI71M` 1:22,000 |  |
| Unnamed lake, Emmet County | MI | 4.2 | 99% | 3 | 165 | 21.3 | IGLD 1985 | `US5MI7KG` 1:12,000 |  |
| Manistee Lake | MI | 4.0 | 90% | 4 | 447 | 15.2 | IGLD 1985 | `US5MI87M` 1:12,000 |  |
| Spring Lake | MI | 3.9 | 97% | 3 | 156 | 12.8 | IGLD 1985 | `US5MKGDF` 1:12,000 |  |
| Pere Marquette Lake | MI | 2.1 | 90% | 4 | 482 | 13.4 | IGLD 1985 | `US6MI86M` 1:4,000 |  |
| Pentwater Lake | MI | 1.6 | 95% | 5 | 169 | 15.2 | IGLD 1985 | `US5MI90B` 1:12,000 |  |
| Betsie Lake | MI | 1.1 | 80% | 2 | 112 | 4.2 | IGLD 1985 | `US5MI90M` 1:12,000 |  |
| Arcadia Lake | MI | 0.8 | 81% | 3 | 118 | 7.9 | IGLD 1985 | `US5MI90A` 1:12,000 |  |
| Unnamed lake, St. Clair County | MI | 0.6 | 72% | 2 | 54 | 3.6 | IGLD 1985 | `US5DETQM` 1:12,000 |  |
| Unnamed lake, Ottawa County | MI | 0.4 | 88% | 3 | 23 | 6.4 | IGLD 1985 | `US5MKGCF` 1:12,000 |  |
| Little Lake | MI | 0.3 | 98% | 3 | 134 | 7.3 | IGLD 1985 | `US6MI77B` 1:4,000 |  |
| Unnamed lake, Ottawa County | MI | 0.3 | 79% | 3 | 66 | 7.0 | IGLD 1985 | `US5MI89B` 1:12,000 |  |
| Beardslee Lake | MS | 3.6 | 91% | 2 | 45 | 8.2 | MLLW | `US5PGLEC` 1:12,000 |  |
| Marsh Lake | MS | 1.9 | 100% | 2 | 17 | 2.1 | MLLW | `US5PGLEC` 1:12,000 |  |
| Lake Mead | NV | 581.0 | 82% | 7 | 1088 | 131.9 | MLLW | `US4NV1GR` 1:45,000 |  |
| Lake Champlain | NY | 1,141.3 | 98% | 3 | 3623 | 121.6 | IGLD 1985, MLLW, low water | `US5NY3MR` 1:12,000 |  |
| Oneida Lake | NY | 206.8 | 99% | 3 | 423 | 16.7 | local datum | `US5NY4CN` 1:12,000 |  |
| Seneca Lake | NY | 173.6 | 100% | 3 | 278 | 193.2 | local datum | `US5NY6AP` 1:12,000 |  |
| Cayuga Lake | NY | 171.2 | 100% | 3 | 343 | 132.5 | local datum | `US5ITHCE` 1:12,000 |  |
| Onondaga Lake | NY | 11.6 | 100% | 3 | 173 | 22.2 | local datum | `US5NY6CY` 1:12,000 |  |
| Unnamed lake, Albany County | NY | 10.5 | 64% | 2 | 39 | 5.1 | local datum | `US5NY3CM` 1:12,000 |  |
| Cross Lake | NY | 8.0 | 99% | 3 | 113 | 19.5 | local datum | `US5NY6DV` 1:10,000 |  |
| Unnamed lake, Rensselaer County | NY | 3.0 | 61% | 2 | 18 | 3.6 | local datum | `US5NY3EO` 1:12,000 |  |
| Port Bay | NY | 1.7 | 99% | 3 | 98 | 7.9 | IGLD 1985 | `US5NY23M` 1:12,000 |  |
| Unnamed lake, Columbia County | NY | 0.8 | 67% | 4 | 29 | 10.3 | local datum | `US5NYCZJ` 1:12,000 |  |
| Unnamed lake, Kings County | NY | 0.7 | 86% | 2 | 23 | 5.8 | MLLW | `US5NY1BE` 1:22,000 |  |
| Unnamed lake, Erie County | OH | 1.1 | 61% | 3 | 144 | 7.0 | IGLD 1985 | `US6OH09M` 1:4,000 |  |
| Unnamed lake, Washington County | RI | 1.3 | 96% | 2 | 61 | 5.4 | MLLW | `US5PVDBB` 1:12,000 |  |
| Pearce Lake | TX | 0.7 | 81% | 2 | 11 | 3.3 | MLLW | `US5HOUBF` 1:20,000 |  |
| Unnamed lake, Chesterfield County | VA | 0.5 | 82% | 2 | 26 | 7.0 | MLLW | `US5HPWEB` 1:10,000 |  |
| Unnamed lake, Norfolk city | VA | 0.4 | 97% | 2 | 13 | 4.8 | MLLW | `US5ORFCD` 1:12,000 |  |
| Unnamed lake, Whitman County | WA | 1.8 | 95% | 5 | 27 | 18.2 | local datum | `US5WA5GG` 1:22,000 |  |
| Unnamed lake, Kewaunee County | WI | 0.4 | 86% | 2 | 17 | 4.2 | IGLD 1985 | `US5WI34M` 1:12,000 |  |

## Tier B: partial detail, not yet covered (102)

| Lake | State | Area km² | Charted | Contour levels | Soundings | Max charted m | Datum | Most detailed cell | Already covered |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Imuruk Basin | AK | 223.9 | 94% | 0 | 20 | 7.6 | MLLW | `US4AK6SN` 1:90,000 |  |
| Unnamed lake, Nome Census Area | AK | 8.0 | 70% | 1 | 0 | 5.4 | MLLW | `US2ARCED` 1:700,000 |  |
| Sarkar Lake | AK | 3.0 | 95% | 0 | 63 | 18.2 | MLLW | `US4AK5JL` 1:45,000 |  |
| Unnamed lake, Ketchikan Gateway Borough | AK | 2.6 | 98% | 1 | 16 | 31.0 | MLLW | `US4AK5GP` 1:45,000 |  |
| Unnamed lake, Kodiak Island Borough | AK | 1.9 | 100% | 1 | 11 | 43.8 | MLLW | `US4AK4LF` 1:90,000 |  |
| Part of Kinak Bay | AK | 0.8 | 99% | 4 | 7 | 53.0 | MLLW | `US4AK4LC` 1:90,000 |  |
| Unnamed lake, Ketchikan Gateway Borough | AK | 0.6 | 66% | 1 | 0 | 18.2 | MLLW | `US3AK1EY` 1:180,000 |  |
| Unnamed lake, Nome Census Area | AK | 0.5 | 100% | 1 | 0 | 9.1 | MLLW | `US2ARCEC` 1:700,000 |  |
| Coral Lake | AK | 0.5 | 100% | 1 | 0 | 5.4 | MLLW | `US2ARCED` 1:700,000 |  |
| Unnamed lake, Sitka City and Borough | AK | 0.3 | 100% | 1 | 7 | 14.6 | MLLW | `US4AK5LI` 1:45,000 |  |
| Unnamed lake, Prince of Wales-Hyder Census Area | AK | 0.3 | 99% | 1 | 4 | 10.9 | MLLW | `US4AK5LK` 1:45,000 |  |
| Unnamed lake, Nome Census Area | AK | 0.3 | 45% | 1 | 0 | 5.4 | MLLW | `US2ARCEC` 1:700,000 |  |
| Unnamed lake, Bethel Census Area | AK | 0.2 | 55% | 1 | 0 | 5.4 | MLLW | `US4AK6DT` 1:90,000 |  |
| Unnamed lake, Bethel Census Area | AK | 0.1 | 53% | 2 | 0 | 5.4 | MLLW | `US4AK6EU` 1:90,000 |  |
| Unnamed lake, Nome Census Area | AK | 0.1 | 92% | 1 | 0 | 1.8 | MLLW | `US4AK6RM` 1:90,000 |  |
| Unnamed lake, Baldwin County | AL | 1.5 | 99% | 1 | 12 | 3.3 | MLLW | `US5MOBIG` 1:12,000 |  |
| Unnamed lake, Sacramento County | CA | 1.5 | 30% | 0 | 20 | 3.6 | MLLW | `US4CA2DM` 1:45,000 |  |
| Unnamed lake, Southeastern Connecticut Planning Region | CT | 1.0 | 92% | 1 | 21 | 2.0 | MLLW | `US5CT1FX` 1:22,000 |  |
| Unnamed lake, Lower Connecticut River Valley Planning Region | CT | 0.8 | 95% | 1 | 23 | 2.4 | MLLW | `US5CT1FS` 1:22,000 |  |
| Unnamed lake, Lower Connecticut River Valley Planning Region | CT | 0.7 | 99% | 1 | 19 | 3.3 | MLLW | `US5CT1FR` 1:22,000 |  |
| Mulberry Pond | DE | 8.2 | 92% | 0 | 39 | 1.8 | MLLW | `US4DE1AC` 1:45,000 |  |
| Unnamed lake, Monroe County | FL | 17.0 | 100% | 1 | 61 | 1.5 | MLLW | `US5FL5GK` 1:12,000 |  |
| Last Huston Bay | FL | 9.3 | 89% | 0 | 102 | 1.5 | MLLW | `US4FL1IV` 1:45,000 |  |
| Chevelier Bay | FL | 6.8 | 89% | 0 | 55 | 1.5 | MLLW | `US4FL1IV` 1:45,000 |  |
| Alligator Bay | FL | 5.3 | 98% | 0 | 33 | 1.5 | MLLW | `US4FL1IV` 1:45,000 |  |
| Sunday Bay | FL | 2.3 | 93% | 0 | 15 | 1.2 | MLLW | `US4FL1IV` 1:45,000 |  |
| House Hammock Bay | FL | 1.8 | 99% | 1 | 19 | 1.5 | MLLW | `US4FL1IV` 1:45,000 |  |
| Lake Surprise | FL | 1.7 | 99% | 1 | 13 | 2.4 | MLLW | `US5FL5GL` 1:12,000 |  |
| Maule Lake | FL | 1.0 | 97% | 1 | 13 | 3.9 | MLLW | `US5MIAEC` 1:12,000 |  |
| Little Hickory Bay | FL | 0.6 | 93% | 0 | 10 | 1.2 | MLLW | `US4FL1KT` 1:45,000 |  |
| Part of Lopez River | FL | 0.5 | 58% | 0 | 11 | 2.7 | MLLW | `US4FL1IV` 1:45,000 |  |
| Hitchens Creek | FL | 0.5 | 91% | 1 | 16 | 2.1 | MLLW | `US4FL2ME` 1:45,000 |  |
| South Lake | FL | 0.3 | 99% | 1 | 8 | 3.9 | MLLW | `US5FL5RO` 1:12,000 |  |
| Part of Indian River Lagoon | FL | 0.1 | 99% | 1 | 19 | 1.5 | MLLW | `US5FL6LK` 1:12,000 |  |
| Lettuce Lake | FL | 0.1 | 98% | 1 | 4 | 3.6 | MLLW | `US5FL5UO` 1:12,000 |  |
| Unnamed lake, Collier County | FL | 0.1 | 93% | 1 | 4 | 3.0 | MLLW | `US5FL3IO` 1:22,000 |  |
| Lake Calumet | IL | 4.2 | 49% | 3 | 39 | 8.2 | IGLD 1985 | `US5CHIGM` 1:12,000 |  |
| Lake Mechant | LA | 202.4 | 85% | 1 | 312 | 7.3 | MLLW | `US5HUMDA` 1:22,000 |  |
| Grand Lake | LA | 190.8 | 96% | 2 | 0 | 3.6 | MLLW | `US5LA1EN` 1:22,000 |  |
| Lake Palourde | LA | 41.9 | 100% | 0 | 67 | 1.8 | MLLW | `US5LA2DK` 1:12,000 |  |
| Bayou Francais | LA | 36.4 | 78% | 0 | 27 | 2.4 | MLLW | `US4LA1FM` 1:45,000 |  |
| Lake Misere | LA | 12.8 | 96% | 1 | 1 | 3.6 | MLLW | `US5LA1EL` 1:22,000 |  |
| Unnamed lake, Plaquemines Parish | LA | 7.0 | 92% | 0 | 17 | 5.7 | MLLW | `US4LA1FN` 1:45,000 |  |
| Unnamed lake, Terrebonne Parish | LA | 6.4 | 80% | 0 | 16 | 0.9 | MLLW | `US5HUMDA` 1:22,000 |  |
| Lake Laurier | LA | 6.0 | 93% | 0 | 19 | 0.9 | MLLW | `US4LA1EM` 1:45,000 |  |
| Unnamed lake, Lafourche Parish | LA | 3.7 | 25% | 2 | 45 | 8.6 | MLLW | `US5FOCCB` 1:12,000 |  |
| Bay Jaque | LA | 3.0 | 80% | 0 | 15 | 2.4 | MLLW | `US4LA1EM` 1:45,000 |  |
| Fiddlers Lake | LA | 2.9 | 92% | 0 | 12 | 0.3 | MLLW | `US4LA1EJ` 1:90,000 |  |
| Bay Denesse | LA | 2.8 | 100% | 4 | 0 | 20.0 | MLLW, local datum | `US5PLQIH` 1:12,000 |  |
| Lake Hackberry | LA | 1.6 | 99% | 1 | 1 | 2.0 | MLLW | `US5LA2CM` 1:12,000 |  |
| Unnamed lake, St. Mary Parish | LA | 1.2 | 97% | 1 | 3 | 11.5 | MLLW | `US4LA1FI` 1:45,000 |  |
| Unnamed lake, Cameron Parish | LA | 0.6 | 92% | 1 | 1 | 3.6 | MLLW | `US5LA1EN` 1:22,000 |  |
| Phoenix Lake | LA | 0.4 | 97% | 1 | 7 | 2.7 | MLLW | `US5ORGCB` 1:22,000 |  |
| Unnamed lake, St. Mary Parish | LA | 0.3 | 72% | 1 | 0 | 1.8 | MLLW | `US4LA1FI` 1:45,000 |  |
| Unnamed lake, Orleans Parish | LA | 0.2 | 98% | 2 | 0 | 5.4 | MLLW | `US5LA3CF` 1:12,000 |  |
| Unnamed lake, Barnstable County | MA | 1.1 | 91% | 0 | 12 | 1.1 | MLLW | `US5MA1EK` 1:12,000 |  |
| Mill Pond | MA | 0.2 | 82% | 1 | 4 | 4.2 | MLLW | `US5MA1GT` 1:22,000 |  |
| Unnamed lake, St. Mary's County | MD | 1.6 | 97% | 1 | 39 | 2.7 | MLLW | `US4MD1BC` 1:45,000 |  |
| Unnamed lake, Anne Arundel County | MD | 0.2 | 96% | 0 | 14 | 1.5 | MLLW | `US5MD1NC` 1:20,000 |  |
| Unnamed lake, Queen Anne's County | MD | 0.2 | 97% | 1 | 10 | 2.1 | MLLW | `US4MD1DE` 1:45,000 |  |
| Unnamed lake, Allegan County | MI | 2.7 | 31% | 2 | 64 | 3.9 | IGLD 1985 | `US5MI89M` 1:12,000 |  |
| Bear Lake | MI | 1.4 | 99% | 1 | 63 | 3.0 | IGLD 1985 | `US5MKGFE` 1:12,000 |  |
| Black Creek | MI | 0.8 | 54% | 1 | 16 | 2.7 | IGLD 1985 | `US5DETKI` 1:12,000 |  |
| Unnamed lake, Ottawa County | MI | 0.4 | 23% | 2 | 10 | 5.0 | IGLD 1985 | `US5MI1OK` 1:12,000 |  |
| Unnamed lake, Brunswick County | NC | 0.1 | 98% | 1 | 7 | 5.1 | MLLW | `US5ILMID` 1:10,000 |  |
| Unnamed lake, Monmouth County | NJ | 2.8 | 74% | 1 | 113 | 3.9 | MLLW | `US5NJ1RM` 1:12,000 |  |
| Unnamed lake, Cape May County | NJ | 0.9 | 96% | 1 | 7 | 2.4 | MLLW | `US5NJ1EE` 1:12,000 |  |
| Unnamed lake, Ocean County | NJ | 0.9 | 76% | 1 | 12 | 1.8 | MLLW | `US5NJ1QM` 1:12,000 |  |
| Unnamed lake, Atlantic County | NJ | 0.3 | 100% | 2 | 8 | 3.0 | MLLW | `US5NJ1HH` 1:12,000 |  |
| Unnamed lake, Atlantic County | NJ | 0.2 | 87% | 1 | 7 | 2.1 | MLLW | `US5NJ1II` 1:12,000 |  |
| Unnamed lake, Ocean County | NJ | 0.1 | 100% | 1 | 3 | 2.4 | MLLW | `US5NJ1MK` 1:12,000 |  |
| Vischer Ferry | NY | 2.2 | 74% | 2 | 4 | 3.6 | local datum | `US5NY3CM` 1:12,000 |  |
| Unnamed lake, Suffolk County | NY | 1.1 | 97% | 0 | 26 | 1.8 | MLLW | `US5NY2EF` 1:22,000 |  |
| Unnamed lake, Suffolk County | NY | 0.7 | 98% | 1 | 11 | 1.5 | MLLW | `US5NY2EE` 1:22,000 |  |
| North Sea Harbor | NY | 0.5 | 93% | 0 | 10 | 1.2 | MLLW | `US5NY2EF` 1:22,000 |  |
| Scallop Pond | NY | 0.4 | 98% | 1 | 9 | 4.8 | MLLW | `US5NY2EF` 1:22,000 |  |
| Part of Long Island Sound | NY | 0.4 | 84% | 1 | 4 | 2.1 | MLLW | `US5NY2FD` 1:22,000 |  |
| Unnamed lake, Suffolk County | NY | 0.2 | 98% | 1 | 2 | 1.9 | MLLW | `US5NY2GF` 1:22,000 |  |
| Unnamed lake, Oneida County | NY | 0.2 | 79% | 2 | 0 | 3.6 | local datum | `US5NY4CS` 1:12,000 |  |
| Van Cleef Lake | NY | 0.1 | 97% | 2 | 5 | 8.8 | local datum | `US5NY6AR` 1:12,000 |  |
| Unnamed lake, Herkimer County | NY | 0.1 | 62% | 2 | 0 | 3.6 | local datum | `US5NY4AX` 1:12,000 |  |
| Unnamed lake, Erie County | OH | 0.2 | 83% | 0 | 38 | 0.9 | IGLD 1985 | `US6OH09M` 1:4,000 |  |
| Scappoose Bay | OR | 1.1 | 62% | 1 | 0 | 1.8 | local datum | `US5PDXIU` 1:12,000 |  |
| Willow Lake | OR | 0.7 | 96% | 3 | 3 | 10.6 | local datum | `US5WA4CI` 1:22,000 |  |
| Unnamed lake, Washington County | RI | 6.4 | 95% | 0 | 80 | 2.1 | MLLW | `US5RI1EC` 1:22,000 |  |
| Unnamed lake, Washington County | RI | 5.4 | 99% | 1 | 171 | 4.9 | MLLW | `US5PVDBB` 1:12,000 |  |
| Unnamed lake, Charleston County | SC | 0.9 | 50% | 2 | 7 | 4.5 | MLLW | `US4SC1BO` 1:45,000 |  |
| Cedar Lakes | TX | 9.9 | 97% | 1 | 2 | 2.1 | MLLW | `US5TX2MY` 1:22,000 |  |
| Taylor Lake | TX | 1.8 | 52% | 0 | 14 | 1.5 | MLLW | `US5HOUCF` 1:10,000 |  |
| Lake Nassau | TX | 0.4 | 42% | 2 | 5 | 3.9 | MLLW | `US5HOUBF` 1:20,000 |  |
| Nayses Bay | VA | 1.9 | 51% | 1 | 5 | 3.0 | MLLW | `US5HPWDI` 1:22,000 |  |
| Unnamed lake, Accomack County | VA | 1.7 | 57% | 1 | 5 | 2.7 | MLLW | `US4VA1EH` 1:45,000 |  |
| Unnamed lake, Gloucester County | VA | 0.5 | 81% | 0 | 11 | 3.0 | MLLW | `US4VA1DD` 1:45,000 |  |
| Unnamed lake, James City County | VA | 0.4 | 67% | 0 | 11 | 3.0 | MLLW | `US5HPWDL` 1:22,000 |  |
| Unnamed lake, James City County | VA | 0.3 | 97% | 0 | 15 | 6.0 | MLLW | `US5HPWDL` 1:22,000 |  |
| Unnamed lake, King George County | VA | 0.1 | 32% | 2 | 2 | 3.6 | MLLW | `US5VA1WE` 1:20,000 |  |
| Unnamed lake, Clark County | WA | 0.2 | 100% | 1 | 3 | 1.8 | local datum | `US5WA3BC` 1:22,000 |  |
| Part of Lake Herbert G West | WA | 0.1 | 98% | 1 | 4 | 2.1 | local datum | `US5WA5GE` 1:22,000 |  |
| Unnamed lake, Manitowoc County | WI | 0.5 | 29% | 1 | 36 | 3.0 | IGLD 1985 | `US5WI34A` 1:12,000 |  |
| Unnamed lake, Manitowoc County | WI | 0.2 | 61% | 1 | 39 | 3.3 | IGLD 1985 | `US5WI34A` 1:12,000 |  |
| Unnamed lake, Mexico | Mexico | 13.1 | 23% | 1 | 0 | 18.2 | MLLW | `US1GLBCF` 1:3,500,000 |  |
| Unnamed lake, Mexico | Mexico | 0.1 | 98% | 1 | 0 | 18.2 | MLLW | `US1GLBCF` 1:3,500,000 |  |

## Tier C: depth bands only, not yet covered (26)

| Lake | State | Area km² | Charted | Contour levels | Soundings | Max charted m | Datum | Most detailed cell | Already covered |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Unnamed lake, Yakutat City and Borough | AK | 0.6 | 88% | 0 | 0 |  | MLLW | `US4AK5VA` 1:90,000 |  |
| Unnamed lake, Wrangell City and Borough | AK | 0.4 | 100% | 0 | 0 | 0.0 | MLLW | `US4AK5JZ` 1:45,000 |  |
| Unnamed lake, Yakutat City and Borough | AK | 0.2 | 99% | 0 | 0 |  | MLLW | `US4AK4QX` 1:45,000 |  |
| Unnamed lake, Bethel Census Area | AK | 0.2 | 100% | 0 | 0 |  | MLLW | `US4AK6BQ` 1:90,000 |  |
| Unnamed lake, Wrangell City and Borough | AK | 0.1 | 99% | 0 | 0 | 0.0 | MLLW | `US4AK5KZ` 1:45,000 |  |
| Unnamed lake, Solano County | CA | 5.0 | 100% | 0 | 1 | 1.2 | MLLW | `US5OAKJI` 1:12,000 |  |
| Unnamed lake, Solano County | CA | 0.3 | 91% | 0 | 5 | 4.8 | MLLW | `US5SACBC` 1:22,000 |  |
| Faka Union Bay | FL | 2.2 | 96% | 0 | 8 | 1.5 | MLLW | `US4FL1JU` 1:45,000 |  |
| Lake Batola | LA | 62.1 | 86% | 0 | 0 |  | MLLW | `US4LA1FN` 1:45,000 |  |
| Unnamed lake, Plaquemines Parish | LA | 39.8 | 97% | 0 | 0 |  | MLLW, local datum | `US5PLQHJ` 1:12,000 |  |
| Sixmile Lake | LA | 18.6 | 97% | 0 | 3 | 1.5 | MLLW | `US4LA1GI` 1:45,000 |  |
| Alexis Bay | LA | 6.0 | 81% | 0 | 0 |  | MLLW, local datum | `US5PLQHJ` 1:12,000 |  |
| Lake Cuatro Caballo | LA | 4.7 | 91% | 0 | 0 |  | MLLW | `US4LA1FN` 1:45,000 |  |
| Unnamed lake, Plaquemines Parish | LA | 4.6 | 95% | 0 | 0 |  | MLLW | `US5PLQHJ` 1:12,000 |  |
| Tigre Lagoon | LA | 1.3 | 89% | 0 | 4 | 2.4 | MLLW | `US5ARAGD` 1:22,000 |  |
| Unnamed lake, Plaquemines Parish | LA | 1.0 | 92% | 0 | 0 |  | MLLW, local datum | `US5PLQII` 1:12,000 |  |
| Unnamed lake, Plaquemines Parish | LA | 0.2 | 84% | 0 | 0 |  | MLLW | `US5PLQHJ` 1:12,000 |  |
| Unnamed lake, Harrison County | MS | 0.5 | 94% | 0 | 0 | 0.0 | MLLW | `US5GPTEB` 1:12,000 |  |
| Cutoff Lake | MS | 0.4 | 93% | 0 | 4 | 0.3 | MLLW | `US4MS1CD` 1:45,000 |  |
| Unnamed lake, Charleston County | SC | 3.5 | 84% | 0 | 4 | 1.5 | MLLW | `US5SC1KR` 1:12,000 |  |
| Unnamed lake, Beaufort County | SC | 0.1 | 51% | 0 | 0 | 0.0 | MLLW | `US4SC1AM` 1:45,000 |  |
| Unnamed lake, Kenedy County | TX | 7.1 | 100% | 0 | 0 |  | MLLW | `US5TX1KB` 1:22,000 |  |
| Unnamed lake, Brazoria County | TX | 1.4 | 78% | 0 | 0 | 0.0 | MLLW | `US5FPOCA` 1:12,000 |  |
| Unnamed lake, Brazoria County | TX | 0.7 | 92% | 0 | 0 | 0.0 | MLLW | `US5TX3AB` 1:22,000 |  |
| Lake Como | TX | 0.2 | 89% | 0 | 2 | 0.6 | MLLW | `US5TX3DE` 1:22,000 |  |
| Unnamed lake, Accomack County | VA | 0.9 | 89% | 0 | 2 | 2.7 | MLLW | `US4VA1DG` 1:45,000 |  |

## Already covered (123)

| Lake | State | Area km² | Charted | Contour levels | Soundings | Max charted m | Datum | Most detailed cell | Already covered |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Unnamed lake, Prince of Wales-Hyder Census Area | AK | 6.6 | 99% | 3 | 215 | 65.8 | MLLW | `US5AK2HM` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Petersburg Borough | AK | 6.0 | 92% | 1 | 9 | 135.3 | MLLW | `US5AK2VT` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Petersburg Borough | AK | 4.9 | 94% | 1 | 4 | 78.6 | MLLW | `US4AK5OZ` 1:45,000 | NOAA NBS (this PR) |
| Unnamed lake, Ketchikan Gateway Borough | AK | 3.5 | 100% | 2 | 22 | 45.7 | MLLW | `US4AK5IO` 1:45,000 | NOAA NBS (this PR) |
| Unnamed lake, Sitka City and Borough | AK | 1.4 | 98% | 3 | 22 | 42.0 | MLLW | `US4AK5NI` 1:45,000 | NOAA NBS (this PR) |
| The Salt Chuck | AK | 0.8 | 100% | 2 | 8 | 42.0 | MLLW | `US4AK5OL` 1:45,000 | NOAA NBS (this PR) |
| Unnamed lake, Ketchikan Gateway Borough | AK | 0.7 | 97% | 1 | 4 | 34.7 | MLLW | `US4AK5IO` 1:45,000 | NOAA NBS (this PR) |
| Unnamed lake, Prince of Wales-Hyder Census Area | AK | 0.5 | 97% | 4 | 15 | 25.6 | MLLW | `US4AK5GN` 1:45,000 | NOAA NBS (this PR) |
| Unnamed lake, Sitka City and Borough | AK | 0.3 | 100% | 2 | 4 | 14.6 | MLLW | `US4AK5NI` 1:45,000 | NOAA NBS (this PR) |
| Unnamed lake, Sitka City and Borough | AK | 0.3 | 99% | 1 | 7 | 36.5 | MLLW | `US5AK2NF` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Prince of Wales-Hyder Census Area | AK | 0.2 | 76% | 1 | 3 | 11.8 | MLLW | `US4AK5KK` 1:45,000 | NOAA NBS (this PR) |
| Unnamed lake, Baldwin County | AL | 2.1 | 97% | 2 | 14 | 2.0 | MLLW | `US5MOBJF` 1:12,000 | NOAA NBS (this PR) |
| Reeder Lake | AL | 0.2 | 100% | 1 | 3 | 3.0 | MLLW | `US4FL1YA` 1:45,000 | NOAA NBS (this PR) |
| Lake Tahoe | CA | 495.6 | 100% | 6 | 890 | 500.0 | MLLW | `US4CA2FR` 1:45,000 | usgs-lake-tahoe-v1 |
| Unnamed lake, Contra Costa County | CA | 16.1 | 99% | 2 | 187 | 8.5 | MLLW | `US5OAKHR` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Solano County | CA | 10.7 | 95% | 4 | 238 | 11.8 | MLLW | `US5OAKII` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Contra Costa County | CA | 5.3 | 100% | 1 | 55 | 3.3 | MLLW | `US5OAKIQ` 1:12,000 | NOAA NBS (this PR) |
| Sherman Lake | CA | 4.8 | 100% | 3 | 66 | 8.8 | MLLW | `US5OAKIO` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Los Angeles County | CA | 0.4 | 88% | 4 | 46 | 20.3 | MLLW | `US5LGBDD` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, San Joaquin County | CA | 0.2 | 97% | 2 | 5 | 9.1 | MLLW | `US5OAKHV` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Capitol Planning Region | CT | 0.3 | 94% | 1 | 19 | 3.9 | MLLW | `US5CT1KO` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Capitol Planning Region | CT | 0.3 | 100% | 2 | 20 | 7.3 | MLLW | `US5CT1KO` 1:22,000 | NOAA NBS (this PR) |
| Lake George | FL | 185.2 | 100% | 1 | 617 | 3.9 | MLLW | `US4FL2MD` 1:45,000 | NOAA NBS (this PR) |
| Barnes Sound | FL | 76.5 | 100% | 2 | 201 | 3.0 | MLLW | `US5FL5GK` 1:12,000 | NOAA NBS (this PR) |
| Crescent Lake | FL | 69.0 | 100% | 1 | 378 | 7.0 | MLLW | `US4FL2ME` 1:45,000 | NOAA NBS (this PR) |
| Lake Monroe | FL | 33.2 | 95% | 1 | 261 | 5.7 | MLLW | `US4FL2LE` 1:45,000 | NOAA NBS (this PR) |
| Lake Jesup | FL | 31.1 | 98% | 0 | 215 | 2.7 | MLLW | `US4FL2KF` 1:45,000 | NOAA NBS (this PR) |
| Rodgers River Bay | FL | 26.7 | 89% | 1 | 205 | 3.0 | MLLW | `US4FL1IV` 1:45,000 | NOAA NBS (this PR) |
| Lake Harney | FL | 23.2 | 95% | 0 | 137 | 2.1 | MLLW | `US4FL2KF` 1:45,000 | NOAA NBS (this PR) |
| Part of Biscayne Bay | FL | 17.6 | 100% | 1 | 198 | 6.2 | MLLW | `US5MIADB` 1:12,000 | NOAA NBS (this PR) |
| Lake Wimico | FL | 16.0 | 100% | 3 | 139 | 3.6 | MLLW | `US5FL2GH` 1:12,000 | NOAA NBS (this PR) |
| Lake Woodruff | FL | 15.7 | 99% | 1 | 123 | 4.5 | MLLW | `US4FL2ME` 1:45,000 | NOAA NBS (this PR) |
| Upper Sugarloaf Sound | FL | 13.2 | 100% | 1 | 70 | 1.5 | MLLW | `US5FL4EU` 1:22,000 | NOAA NBS (this PR) |
| Tarpon Creek | FL | 4.3 | 100% | 1 | 21 | 1.2 | MLLW | `US4FL1HW` 1:45,000 | NOAA NBS (this PR) |
| Little Buttonwood Sound | FL | 3.6 | 100% | 1 | 38 | 1.8 | MLLW | `US5FL5GK` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Monroe County | FL | 3.4 | 86% | 1 | 22 | 2.7 | MLLW | `US4FL1HV` 1:45,000 | NOAA NBS (this PR) |
| Largo Sound | FL | 3.3 | 98% | 0 | 19 | 1.8 | MLLW | `US5FL5GK` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Monroe County | FL | 3.1 | 100% | 2 | 19 | 2.4 | MLLW | `US5FL5GK` 1:12,000 | NOAA NBS (this PR) |
| Lake Beresford | FL | 3.0 | 98% | 1 | 26 | 2.1 | MLLW | `US4FL2LE` 1:45,000 | NOAA NBS (this PR) |
| Naples Bay | FL | 2.4 | 96% | 1 | 44 | 4.4 | MLLW | `US5FL3HO` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Monroe County | FL | 1.8 | 100% | 0 | 15 | 0.6 | MLLW | `US5FL4DT` 1:22,000 | NOAA NBS (this PR) |
| Spring Garden Lake | FL | 1.8 | 93% | 0 | 14 | 1.2 | MLLW | `US4FL2ME` 1:45,000 | NOAA NBS (this PR) |
| Part of Indian River Lagoon | FL | 1.4 | 88% | 0 | 10 | 7.6 | MLLW | `US5PCVFC` 1:22,000 | NOAA NBS (this PR) |
| Part of Tampa Bay | FL | 1.4 | 100% | 1 | 22 | 3.3 | MLLW | `US4FL1PQ` 1:45,000 | NOAA NBS (this PR) |
| Broad River Bay | FL | 1.3 | 69% | 1 | 3 | 1.5 | MLLW | `US4FL1IV` 1:45,000 | NOAA NBS (this PR) |
| Dumfoundling Bay | FL | 1.2 | 99% | 3 | 17 | 14.0 | MLLW | `US5FL5RO` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Escambia County | FL | 1.2 | 97% | 1 | 48 | 2.4 | MLLW | `US5FL1JD` 1:12,000 | NOAA NBS (this PR) |
| Two Island Bay | FL | 1.1 | 99% | 1 | 9 | 1.2 | MLLW | `US4FL1IV` 1:45,000 | NOAA NBS (this PR) |
| Part of Tampa Bay | FL | 1.0 | 100% | 0 | 11 | 0.9 | MLLW | `US5TPAEH` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Broward County | FL | 0.9 | 97% | 2 | 126 | 7.6 | MLLW | `US5PEFCA` 1:12,000 | NOAA NBS (this PR) |
| Browns Creek | FL | 0.8 | 99% | 1 | 20 | 6.0 | MLLW | `US5JAXFD` 1:12,000 | NOAA NBS (this PR) |
| Collier Bay | FL | 0.8 | 99% | 0 | 16 | 1.5 | MLLW | `US4FL1JT` 1:45,000 | NOAA NBS (this PR) |
| Basin Bayou | FL | 0.7 | 99% | 1 | 14 | 1.5 | MLLW | `US5FL1JQ` 1:12,000 | NOAA NBS (this PR) |
| Jim Long Lake | FL | 0.6 | 94% | 2 | 16 | 2.4 | MLLW | `US4FL1NS` 1:45,000 | NOAA NBS (this PR) |
| Plate Creek Bay | FL | 0.6 | 92% | 1 | 7 | 1.2 | MLLW | `US4FL1IV` 1:45,000 | NOAA NBS (this PR) |
| Unnamed lake, Duval County | FL | 0.5 | 99% | 0 | 15 | 2.4 | MLLW | `US5JAXFE` 1:12,000 | NOAA NBS (this PR) |
| Shell Key Bay | FL | 0.5 | 98% | 1 | 5 | 1.5 | MLLW | `US4FL1JT` 1:45,000 | NOAA NBS (this PR) |
| Part of Santa Rosa Sound | FL | 0.5 | 100% | 1 | 9 | 3.6 | MLLW | `US5FL1HF` 1:12,000 | NOAA NBS (this PR) |
| Back Bay | FL | 0.4 | 99% | 1 | 4 | 1.5 | MLLW | `US5FL3OJ` 1:22,000 | NOAA NBS (this PR) |
| North Lake | FL | 0.4 | 98% | 0 | 11 | 1.8 | MLLW | `US5FL5RO` 1:12,000 | NOAA NBS (this PR) |
| Mullet Lake | FL | 0.4 | 96% | 0 | 11 | 0.6 | MLLW | `US4FL2KF` 1:45,000 | NOAA NBS (this PR) |
| Lake Wyman | FL | 0.4 | 98% | 1 | 5 | 2.1 | MLLW | `US5FL5WP` 1:12,000 | NOAA NBS (this PR) |
| Part of Tampa Bay | FL | 0.4 | 100% | 1 | 15 | 4.5 | MLLW | `US5TPAFG` 1:12,000 | NOAA NBS (this PR) |
| Part of Indian River Lagoon | FL | 0.3 | 100% | 2 | 35 | 3.3 | MLLW | `US5FL6LK` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Duval County | FL | 0.3 | 94% | 0 | 10 | 2.4 | MLLW | `US5JAXFE` 1:12,000 | NOAA NBS (this PR) |
| Lake Boca Raton | FL | 0.3 | 99% | 1 | 6 | 2.7 | MLLW | `US5FL5WP` 1:12,000 | NOAA NBS (this PR) |
| Whitecomb Bayou | FL | 0.3 | 91% | 1 | 4 | 2.1 | MLLW | `US5TPAKE` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Broward County | FL | 0.2 | 100% | 0 | 8 | 2.1 | MLLW | `US5PEFBA` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Broward County | FL | 0.2 | 100% | 3 | 9 | 14.3 | MLLW | `US5PEFBA` 1:12,000 | NOAA NBS (this PR) |
| Part of Lemon Bay | FL | 0.2 | 100% | 1 | 6 | 2.1 | MLLW | `US5FL3RH` 1:22,000 | NOAA NBS (this PR) |
| Garrison Bight | FL | 0.2 | 95% | 0 | 19 | 1.9 | MLLW | `US5FL4DR` 1:12,000 | NOAA NBS (this PR) |
| Lake Pend Oreille | ID | 360.3 | 93% | 7 | 431 | 352.9 | local datum | `US4ID1UC` 1:45,000 | NOAA NBS (this PR) |
| Lake Pontchartrain | LA | 1,645.2 | 100% | 8 | 895 | 21.0 | MLLW, local datum | `US5LA3CB` 1:12,000 | NOAA NBS (this PR) |
| Calcasieu Lake | LA | 256.3 | 98% | 4 | 224 | 11.8 | MLLW | `US5LCHHA` 1:12,000 | NOAA NBS (this PR) |
| Lake Maurepas | LA | 237.0 | 99% | 1 | 394 | 7.6 | MLLW | `US4LA1HL` 1:45,000 | NOAA NBS (this PR) |
| Bayou Chouvere | LA | 32.2 | 97% | 0 | 38 | 4.2 | MLLW | `US4LA1EL` 1:45,000 | NOAA NBS (this PR) |
| Lost Lake | LA | 18.3 | 90% | 0 | 23 | 2.7 | MLLW | `US4LA1EJ` 1:90,000 | NOAA NBS (this PR) |
| Bay Junop | LA | 15.2 | 94% | 1 | 55 | 2.4 | MLLW | `US4LA1EJ` 1:90,000 | NOAA NBS (this PR) |
| North Pass | LA | 7.6 | 100% | 4 | 53 | 7.3 | MLLW | `US5LA3EH` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Terrebonne Parish | LA | 7.2 | 98% | 0 | 12 | 0.6 | MLLW | `US5HUMEA` 1:22,000 | NOAA NBS (this PR) |
| Wax Lake | LA | 0.9 | 95% | 1 | 3 | 6.4 | MLLW | `US4LA1FI` 1:45,000 | NOAA NBS (this PR) |
| Pocha Pond | MA | 0.6 | 97% | 0 | 19 | 1.7 | MLLW | `US5MA1CM` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Barnstable County | MA | 0.4 | 100% | 1 | 6 | 4.2 | MLLW | `US5MA1HS` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Suffolk County | MA | 0.2 | 100% | 1 | 7 | 3.4 | MLLW | `US5BOSCC` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Barnstable County | MA | 0.1 | 100% | 2 | 6 | 7.2 | MLLW | `US5MA1IT` 1:22,000 | NOAA NBS (this PR) |
| Lake Saint Clair | MI | 1,161.2 | 94% | 3 | 1419 | 18.8 | IGLD 1985 | `US5DETHG` 1:12,000 | NCEI Great Lakes grid |
| Muskegon Lake | MI | 16.5 | 96% | 5 | 965 | 24.0 | IGLD 1985 | `US5MKGFD` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Cheboygan County | MI | 1.6 | 94% | 3 | 65 | 13.3 | IGLD 1985 | `US5MI7NJ` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Ottawa County | MI | 0.3 | 87% | 3 | 42 | 6.7 | IGLD 1985 | `US5MKGCG` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Ottawa County | MI | 0.3 | 89% | 2 | 21 | 4.8 | IGLD 1985 | `US5MKGDF` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Craven County | NC | 1.5 | 99% | 0 | 48 | 2.1 | MLLW | `US5NC2BD` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Hyde County | NC | 0.1 | 100% | 1 | 5 | 4.4 | MLLW | `US5NC2EO` 1:12,000 | NOAA NBS (this PR) |
| Irondequoit Bay | NY | 6.4 | 92% | 5 | 80 | 22.8 | IGLD 1985 | `US5NY6EH` 1:22,000 | NOAA NBS (this PR) |
| Napeague Harbor | NY | 3.5 | 99% | 1 | 66 | 5.7 | MLLW | `US5NY2FK` 1:22,000 | NOAA NBS (this PR) |
| Quantuck Bay | NY | 1.7 | 92% | 1 | 28 | 2.0 | MLLW | `US5NY9EV` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Suffolk County | NY | 0.8 | 96% | 1 | 27 | 3.6 | MLLW | `US5NY2FG` 1:22,000 | NOAA NBS (this PR) |
| Moneyboque Bay | NY | 0.3 | 95% | 2 | 4 | 5.0 | MLLW | `US5NY9EV` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Monroe County | NY | 0.2 | 94% | 2 | 5 | 3.9 | IGLD 1985 | `US5NY6EG` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Peñuelas Municipio | PR | 0.2 | 98% | 1 | 18 | 3.6 | MLLW | `US5PSEDC` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Charleston County | SC | 0.3 | 62% | 1 | 2 | 2.7 | MLLW | `US4SC1CO` 1:45,000 | NOAA NBS (this PR) |
| Sabine Lake | TX | 238.6 | 100% | 4 | 388 | 7.3 | MLLW | `US5BPTAD` 1:12,000 | NOAA NBS (this PR) |
| Lake Anahuac | TX | 19.8 | 100% | 0 | 43 | 1.5 | MLLW | `US4TX1OK` 1:45,000 | NOAA NBS (this PR) |
| Moses Lake | TX | 9.5 | 94% | 2 | 158 | 12.4 | MLLW | `US5HOUAG` 1:20,000 | NOAA NBS (this PR) |
| Mud Lake | TX | 7.8 | 80% | 3 | 279 | 4.3 | MLLW | `US5HOUCF` 1:10,000 | NOAA NBS (this PR) |
| Muleshoe Lake | TX | 0.9 | 84% | 2 | 29 | 4.8 | MLLW | `US5HOUFF` 1:10,000 | NOAA NBS (this PR) |
| Unnamed lake, Harris County | TX | 0.6 | 64% | 0 | 30 | 1.5 | MLLW | `US5HOUDF` 1:10,000 | NOAA NBS (this PR) |
| Unnamed lake, Virginia Beach city | VA | 5.3 | 99% | 1 | 74 | 3.3 | MLLW | `US5VA1FT` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, Isle of Wight County | VA | 2.4 | 96% | 1 | 9 | 3.3 | MLLW | `US5HPWAM` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Mathews County | VA | 1.0 | 98% | 1 | 24 | 1.8 | MLLW | `US5VA1LQ` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, Northampton County | VA | 0.3 | 100% | 1 | 12 | 2.4 | MLLW | `US5VA1KU` 1:22,000 | NOAA NBS (this PR) |
| Unnamed lake, St. Croix Island | VI | 0.4 | 88% | 0 | 21 | 2.7 | MLLW | `US5VI1DS` 1:12,000 | NOAA NBS (this PR) |
| Unnamed lake, St. Thomas Island | VI | 0.3 | 93% | 0 | 14 | 1.5 | MLLW | `US5VI1LP` 1:12,000 | NOAA NBS (this PR) |
| Franklin D Roosevelt Lake | WA | 269.2 | 100% | 6 | 256 | 121.6 | local datum | `US4WA1HV` 1:45,000 | NOAA NBS (this PR) |
| Lake Washington | WA | 83.8 | 100% | 5 | 753 | 64.0 | MLLW | `US5SEAEM` 1:12,000 | NOAA NBS (this PR) |
| Lake Union | WA | 1.8 | 100% | 4 | 147 | 14.9 | MLLW | `US5SEAGM` 1:12,000 | NOAA NBS (this PR) |
| Part of Puget Sound | WA | 0.3 | 97% | 4 | 48 | 14.9 | MLLW | `US5SEAFL` 1:12,000 | NOAA NBS (this PR) |
| Part of Puget Sound | WA | 0.2 | 91% | 1 | 17 | 2.5 | MLLW | `US5SEAEM` 1:12,000 | NOAA NBS (this PR) |
| Lake Winnebago | WI | 645.5 | 85% | 3 | 482 | 8.5 | IGLD 1985 | `US6WI01A` 1:4,000 | NOAA NBS (this PR) |
| Lake Superior | Great Lakes | 81,843.9 | 100% | 6 | 1066 | 431.5 | IGLD 1985, MLLW | `US6WI23A` 1:2,000 | NCEI Great Lakes grid |
| Lake Huron | Great Lakes | 59,399.3 | 67% | 5 | 1664 | 228.6 | IGLD 1985 | `US6MI42A` 1:4,000 | NCEI Great Lakes grid |
| Lake Michigan | Great Lakes | 57,726.8 | 100% | 6 | 1347 | 281.3 | IGLD 1985 | `US6MI56A` 1:4,000 | NCEI Great Lakes grid |
| Lake Erie | Great Lakes | 25,767.8 | 51% | 5 | 1732 | 57.3 | IGLD 1985 | `US6MI07A` 1:4,000 | NCEI Great Lakes grid |
| Lake Ontario | Great Lakes | 19,347.4 | 44% | 6 | 1830 | 244.4 | IGLD 1985, local datum | `US6NY27M` 1:4,000 | NCEI Great Lakes grid |
