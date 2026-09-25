# Contributing to TopoStack

Thanks for helping. TopoStack is a solo developer's spare-time project, so clear reports and small, focused pull requests go a long way.

## Reporting a problem or an idea

- **In the studio:** use **Feedback** (the tab on the right edge of the preview, or the page footer). It can attach location and data diagnostics you review before sending, and reaches the maintainer by email without a GitHub account.
- **On GitHub:** open an [issue](https://github.com/Echo-Foxtrot-Works/topostack/issues/new/choose). There are templates for bugs, feature requests, terrain data and lake data.

For bugs, include the output type (layered or flat), the location, reproduction steps and your browser. A project-settings JSON (studio **Export → Project settings**) makes geometry problems reproducible.

## Making a change

1. Read [CLAUDE.md](CLAUDE.md) for the one-page map of where each kind of change goes, and [docs/architecture.md](docs/architecture.md) for the geometry flow and invariants the tests protect.
2. Follow [docs/development.md](docs/development.md) to install the pinned Node version and run the studio (`npm run dev:web` needs no credentials).
3. Branch from `dev`. Pull requests target `dev`; releases are promoted to `main`.
4. Put tests beside the code they cover.
5. If users will notice the change, add a changelog fragment written for makers:

   ```sh
   npm run changelog:new -- <feature|improvement|fix|breaking> "Title"
   ```

   Otherwise label the pull request `no-changelog`. See [docs/changelog.md](docs/changelog.md).

## Before opening a pull request

```sh
npm run typecheck
npm run lint
npm test
```

For changes to what the studio renders, also run the build with its bundle budgets and the browser suite:

```sh
npm run build && npm run budget:web
npm run test:e2e -- --project=chromium
```

Run generator tests from `apps/generator` or with `npm run test -w @topostack/generator`. In the pull request, say what you changed, why, and what you ran (and what you did not).

## Things CI enforces

- Import workspace packages by name (`@topostack/core`, `@topostack/data-contracts/<module>`), never by path into another package's `src/`.
- `@topostack/core` stays free of Svelte, DOM, storage and platform imports; the Worker never generates contours.
- Versioned formats (`ProjectConfigV1`, `SourceBundleV1`, `GeometryIRV1`, the export manifest) change only with a migration.
- Bundle budgets guard what a visitor waits for. If one fails, first check the change did not land on a critical path.

## Data

Terrain and lake data come from public sources with their own licences; see [docs/data-and-fabrication.md](docs/data-and-fabrication.md). If you know of an open lake survey or depth chart that TopoStack should use, open a lake-data issue with its source and licence.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).
