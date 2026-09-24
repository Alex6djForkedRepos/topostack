# Explicit contour topology validation — September 23, 2026

The reviewed workflow now prepares geometry without seed depth points or a uniform contour interval. Each path is an outer shoreline, island boundary, or valued depth contour. Depth contours carry a deeper/shallower interior direction. Immediate containment checks support rises inside basins and separate nested features, while rejecting crossings, touching paths, duplicate nested levels, contours in island land, and contradictory interior values.

Innermost interiors hold their contour value unless the user supplies an explicit bottom or summit. Island boundaries survive review-draft recovery, saved chart parsing, grid masking, and subtraction from terrain water polygons. Saved topology receipts use `contour-topology-v1`; existing `closed-contours-v1` records remain readable. New explicit records omit the legacy interval field.

## Software checks

- Generator: 424 domain/site tests and 137 component tests passed.
- Chart tracing: 75 tests passed; data contracts: 117 tests passed.
- All 24 depth-chart browser cases passed across Chromium, Firefox, and WebKit, including island/rise draft recovery, generation, mobile layout, and zoom/pan editing.
- The combined 36-case chart/viewport run had one Chromium terrain-ready timeout under concurrent load. All four Chromium viewport cases passed when rerun with one worker; Firefox and WebKit viewport cases passed in the initial run.
- After the final interval compatibility cleanup, the affected domain/guide tests, tracing/contract suites, and three Chromium save/island/rise cases passed again.
- TypeScript and the Svelte build passed. The tests exercise synthetic topology examples; they do not establish independent real-world island/rise tracing accuracy or physical fabrication quality.

## Real-source check

Re-ran the existing explicitly reviewed USGS King City South fixture and live upload/recovery/generation flow. Current output: eight valued contours, 2,175 stored vertices, a 103 × 127 grid at 5 m spacing, 4,551 water cells, and a 4.4 m deepest modeled depth. Alignment overlap remains approximately 93.8%. No contour labels were inferred.

The earlier 4.7 m maximum included a half-interval extension. The published median/P95 sounding errors in the original release report describe that historical interpolation, not this changed default. They have not been reused as accuracy scores for the new topology cases.

Refreshed real-source editing, generated-depth, library, and terrain screenshots. Fresh project import and terrain generation completed with six layers/six panels and no browser exceptions. The incomplete shoreline coverage warning remains visible. The guide assets are copied from these captures; no screenshot represents a physical cut or assembly.
