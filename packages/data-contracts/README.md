# @topostack/data-contracts

Small, dependency-light modules that the browser app, the `map-api` Worker, and the Node provisioning scripts must all agree on. Nothing here depends on the geometry engine in `@topostack/core`, and nothing in core depends on this package.

| Subpath | Owns |
| --- | --- |
| `@topostack/data-contracts/source-catalog` | Terrain and survey catalog validation and ranking (`scripts/data/*.json` is validated against it in every consumer) |
| `@topostack/data-contracts/archive-release` | The `release.json` shape that names the current PMTiles archive |
| `@topostack/data-contracts/terrain-png` | Decoding of the numeric terrain PNG served by the Worker |
| `@topostack/data-contracts/usage` | Usage-event names and validation shared by the studio and the Worker |

The package is source-only. Each subpath resolves straight to a `.ts` file, so Vite, Wrangler, Vitest, and Node's native type stripping all consume it without a build step. Keep every module free of `.js` import specifiers and of TypeScript-only syntax that Node cannot strip (enums, namespaces, parameter properties).
