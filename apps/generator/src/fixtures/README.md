# West Point elevation regression fixtures

Unmodified Mapzen Terrarium tiles retrieved 2026-09-15:

- `west-point-z12.png`: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/1206/1529.png
- `west-point-z15.png`: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/9652/12238.png

These contain upstream shoreline artifacts near West Point, NY, including native
pixels as low as -7,735 m beside near-sea-level terrain. Keep the original bytes
so tests cover PNG decoding and repair before interpolation, at multiple zooms.

Source attribution: Mapzen terrain tiles, compiled from open elevation datasets.
See https://github.com/tilezen/joerd/blob/master/docs/attribution.md and
https://github.com/tilezen/joerd/blob/master/docs/data-sources.md.

## NOAA Lake Erie depth tile

`noaa-erie-z11.png` is a numeric depth tile from the pinned NOAA Great Lakes
build. Its source is [NOAA/NCEI Lake Erie and Lake St. Clair bathymetry](https://doi.org/10.7289/V5KS6PHK).
RGB encodes positive depth using Terrarium's formula; transparent pixels have no
coverage. `noaa-erie-z11.json` records a small interior sample for testing pixel
center alignment. Source hashes are in `scripts/data/noaa-great-lakes-sources.json`.

`usgs-crater-z14` and `swiss-zug-z14` are numeric PNG tiles from the pinned survey
archives built by `scripts/build-survey-bathymetry.py`. Their adjacent JSON files
record dataset IDs, tile coordinates, sample bounds, and nine independently
decoded pixel values. Crater values are depths in meters; Swiss values are LN02
bed elevations in meters. Sources: USGS DDS-72 (public domain) and swisstopo
swissBATHY3D (open government data, © swisstopo).
