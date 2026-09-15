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
