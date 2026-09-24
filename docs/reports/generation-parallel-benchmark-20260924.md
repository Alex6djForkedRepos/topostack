# Parallel generation benchmark — 2026-09-24

Large relief stacks now distribute alignment guides and elevation-label candidate searches across a persistent helper pool. Four helpers completed the requested **3000 × 3000 mm Grand Teton map with 3 mm sheets in 10.09–10.11 seconds**, compared with **15.39–21.63 seconds** for the optimized serial implementation. All source and output hashes matched between worker counts. There were no worker fallbacks during timing runs.

| Helpers | Terrain cold generation, two runs | Cached elevation-label toggle, two runs |
| --- | ---: | ---: |
| 0 (serial) | 15.39 / 21.63 s | 8.50 / 8.65 s |
| 2 | 13.23 / 12.95 s | 6.58 / 7.13 s |
| 4 | 10.09 / 10.11 s | 5.17 / 5.44 s |

Four helpers were about 34% faster than even the fastest serial cold run. These are local diagnostic samples, not a statistically controlled speedup estimate. Development processes were active; the wide serial cold range shows why the individual samples are retained. An earlier four-helper run measured 10.04 seconds cold and 4.92 seconds for the toggle.

| Dense-road stress workload, one run | Cold generation | Cached elevation-label toggle |
| --- | ---: | ---: |
| Serial | 22.82 s | 18.79 s |
| Four helpers | 18.40 s | 15.40 s |

The dense-road improvement is smaller because covering unions and feature routing remain serial. Contour extraction and material nesting also remain serial. This change introduces no Rust dependency or WASM assets.

## Workload and interpretation

The fixture matches the [serial optimization report](generation-benchmark-20260924.md): 193 layers, a 768 × 768 elevation grid sampled from public Terrarium z12 tiles, default 2× vertical exaggeration, default nesting, alignment guides, and elevation labels. Bounds are west −110.94, east −110.65, south 43.63, north 43.84. Terrain is real; the optional 300 full-width, 80-point roads are synthetic stress paths. There are no lake polygons or bathymetry in this benchmark.

The Node 26.5.0 benchmark runs the production browser pool scheduler through a Node worker-thread adapter, including structured cloning, helper startup, chunk scheduling, and result collection. It creates a fresh terrain session for each cold case, while helpers persist within each report. Each cold generation is followed by disabling elevation labels with the same source; that edit changes the workload and is not an isolated cache-speed measurement.

Browser coordinator startup, source acquisition, main-thread source transfer, preview meshing, rendering, and export are excluded. The figures therefore describe geometry generation, not total time from selecting a location to viewing a finished map. Parallelism begins at 32 relief layers; smaller maps and shared-face engravings retain serial execution.

## Verification

- All 312 core tests passed, including structured-clone parity with roads, split pieces, cached edits, cancellation, and overlapping-session rejection.
- All 574 generator tests passed, including bounded concurrency, out-of-order completion, worker reuse, construction/runtime/protocol/timeout failures, cancellation, disposal, and the client cancellation-acknowledgement protocol.
- Production nested worker bundles passed Chromium, Firefox, and WebKit checks with a custom Hershey font, cancellation and reuse of the same coordinator/source, and server-blocked helper loading. Serial fallback and parallel output matched exactly within each browser.
- Browser output also matched Node's complete geometry structure and text, allowing an absolute numeric difference of 1e-8 for cross-engine floating-point math. Only generatedAt was ignored.
- Typecheck, lint, core/generator builds, and existing web bundle budgets passed. No budget was raised. Lint excluded the unrelated local nesting worktree and terrain Python virtual environment.

See [raw measurements](data/generation-parallel-benchmark-20260924.json) and [generation performance](../generation-performance.md) for commands and worker lifecycle details. Changes are local; no deployment was performed.
