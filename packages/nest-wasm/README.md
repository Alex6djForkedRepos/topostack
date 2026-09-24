# @topostack/nest-wasm

Strip packing for TopoStack's sheet nesting. The package compiles [sparrow](https://github.com/JeroenGar/sparrow) (MIT, © 2025 Jeroen Gardeyn, KU Leuven) and [jagua-rs](https://github.com/JeroenGar/jagua-rs) (MPL-2.0) to WebAssembly without modifying either, and adds a small TypeScript wrapper. Licence details are in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) and [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

sparrow solves one problem: fit every part into a strip of fixed height and make the strip as short as possible. TopoStack's multi-sheet planner in `@topostack/core` calls this solver repeatedly to fill whole sheets.

## Using it

```ts
import wasmUrl from "@topostack/nest-wasm/wasm?url";
import { loadNestEngine } from "@topostack/nest-wasm";

const engine = await loadNestEngine(wasmUrl);
const result = engine.pack({ items: [{ outline, orientationsDeg: [0, 90, 180, 270] }], stripHeight: 300, spacing: 2, timeLimitMs: 2000 });
```

- **Blocking:** `pack` runs synchronously until its time limit, or until `targetWidth` is met. Call it from a worker.
- **Placements:** each one maps its item's input outline as `p' = R(rotationDeg) · p + (x, y)`. The results lie within `[0, stripWidth] × [0, stripHeight]`, and outlines stay at least `spacing` apart. Outlines may touch the strip edge, and may cross it by at most `fitTolerance` (default 0.01).
- **Holes:** jagua-rs 0.8.3 ignores holes in items, so pass outer boundaries only.
- **Threads:** the build is single-threaded, so it needs no cross-origin isolation.

## Layout

| Path | What |
| --- | --- |
| `src/lib.rs`, `src/job.rs`, `src/solve.rs` | The wasm-bindgen shim: the JSON job format, the deadline terminator and the progress listener |
| `tests/strip_pack.rs` | Native tests: containment, spacing, orientations, time limit, early stop |
| `src/index.ts` | TypeScript wrapper and wire types |
| `pkg/` | **Committed** build output, so app builds and CI jobs need no Rust |
| `about.toml`, `about.hbs`, `deny.toml` | Licence notice generation and the licence allow-list |

## Rebuilding

Rebuild after any change to `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml` or `src/*.rs`. The main CI job runs `node scripts/build.mjs --check`, which fails when `pkg/` was built from other sources.

You need:
- rustup, which installs the toolchain pinned in `rust-toolchain.toml`
- `cargo install wasm-bindgen-cli --version 0.2.100 --locked`
- binaryen's `wasm-opt` (version 133)

```bash
cargo test --release
npm run build:nest-wasm
npm run test -w @topostack/nest-wasm
cargo about generate about.hbs -o THIRD_PARTY_LICENSES.md
cargo deny check licenses sources
```

The `nest-wasm.yml` workflow runs the same steps on every change to this package.

## Upgrading sparrow or jagua-rs

1. Bump the pinned `rev` or version in `Cargo.toml`, and `SPARROW_REV` in `src/lib.rs`.
2. Re-run the native tests. They check that the exported transformations still map the input coordinates.
3. Rebuild and regenerate the licence notices.
