# Grand Teton generation benchmark — 2026-09-24

The requested 3000 × 3000 mm artwork with 3 mm sheets produces **193 layers** in the Grand Teton fixture. The final engine completed terrain generation in **16.37 seconds**, or **23.94 seconds** with 300 synthetic full-width road paths. The untouched original engine was stopped after more than nine minutes without finishing its first terrain-only generation.

| Workload | Cold generation | Elevation-label toggle, same source |
| --- | ---: | ---: |
| Real terrain, default guides, nesting and elevation labels | 16.37 s | 9.07 s |
| Same terrain plus 300 synthetic roads | 23.94 s | 20.12 s |

These are single-run local Node 26.5.0 measurements on macOS, not browser latency guarantees. Other development processes were active. Earlier intermediate runs ranged higher under load; no exact speedup ratio or completed original-engine baseline is claimed. Downloads, worker transfers, three.js meshing, rendering, and export are excluded. The label-toggle case changes the workload by disabling elevation labels; it demonstrates cache use, not an isolated measurement of cache speedup.

The fixture uses 768 × 768 bilinearly sampled Terrarium z12 elevations; bounds −110.94…−110.65 longitude and 43.63…43.84 latitude; default 2× vertical exaggeration; unchanged minimum feature size, smoothing, glue margin, and kerf. It contains no lake polygons or bathymetry. Synthetic roads contain 80 points each and cross the whole map, generating 138,492 markings. The terrain-only result has 3,336 markings. These artificial road paths are a load test, not the actual Grand Teton road network.

## Where time goes after the changes

| Stage | Terrain only | Dense roads |
| --- | ---: | ---: |
| Contours and initial cache snapshot | 3.83 s | 3.61 s |
| Nesting | 1.98 s | 1.96 s |
| Fabrication indexes and covering unions | 0.01 s | 4.64 s |
| Feature routing | <0.01 s | 4.21 s |
| Alignment annotations | 5.08 s | 4.94 s |
| Elevation labels | 5.45 s | 4.47 s |

Cached edits spend approximately 0.46 seconds cloning saved contour layers, skipping water carving, ladder construction, and contour extraction. Fabrication and annotation stages still run. The remaining costs suggest profiling alignment offsets, label candidate preparation, and 3D rendering separately before committing to a terrain WASM port.

## Correctness and checks

- Original and updated complete geometry were deeply identical, excluding `generatedAt`, on deterministic 300, 900, and 3000 mm cases with 10, 30, and 101 layers and road markings.
- The Grand Teton output hash stayed identical across indexed containment and label-index refinements. Its original 193-layer run did not finish, so this report does not claim full original/new parity for that stress fixture.
- Exhaustive reference tests cover indexed containment, boundary clipping, concavity, holes, intersections, and clearance. A forced covering-union failure produces the same clipped output through the original-ring fallback.
- Cache tests cover downstream edits, terrain invalidation, replaced source snapshots, source warnings, output mutation, lake carving, shoreline smoothing, and depth overrides.
- 308 core tests and 564 generator tests passed. Core coverage passed its thresholds (98.44% line coverage on the 307-test run before the additional lake-cache test).
- Repository typecheck, production build, and bundle budgets passed. Default-preview startup JavaScript was 466,670 gzip bytes against 485,000.
- Lint passed with `.claude/worktrees/**` and `.terrain-venv/**` excluded. Unrestricted lint traversed other worktrees and exhausted Node's heap; excluding worktrees alone also picked up vendored Matplotlib JavaScript from the local Python environment. No lint rules were relaxed for repository code.
- Live browser performance and end-to-end tests were not run for this change.

[Raw measurements](data/generation-benchmark-20260924.json) include input/output hashes and individual stage timings. [Reproduction instructions and implementation notes](../generation-performance.md) describe the benchmark and cache contract. Baseline commit: `29c8a79deb62fbd6b23f9aabcc3c45abd1310205`.
