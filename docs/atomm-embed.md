# The Atomm embed

Inside Atomm the studio renders the platform's layout 3 (lead rail, canvas, 320px parameters rail) from [design.md](https://dev.atomm.com/design.md) and the [layout-3 skeleton](https://dev.atomm.com/templates/layout-3-generate.skeleton.html). The embed is detected by running in a frame (`window.parent !== window`); the vendored stylesheet and the embed's own adaptations live in `apps/generator/src/lib/atomm/atomm-workbench.css`.

## How it differs from the standalone studio

These follow from Atomm's September 2026 review of 0.1.2, which asked for fewer controls, spec styling and a flow users cannot get stuck in.

| Area | Standalone studio | Atomm embed | Why |
| --- | --- | --- | --- |
| Terrain | Generate button; a moved map area waits for regeneration | Loads real terrain on open, and reloads it when a place is chosen, the map selection moves, or a project is imported or reset. The lead rail shows a **Load terrain** / **Try again** button only after a failure or cancellation. | Reviewers found users did not know to regenerate after moving the selection. The platform treats a Generate button on a live-preview generator as a defect. |
| View tabs | Map, Cut layers, 3D stack, Custom data | Map, 2D, 3D, **Export** | The platform expects an Export view. It shows the master SVG that Open in Studio sends, with the download's file list and sizes, built from the same `buildProjectPackage` call the export hook uses. |
| Custom data | Depth charts, markers, paths, file import and graphics in their own view | Markers, paths and file import in the lead rail; no depth charts or graphics | Tracing a depth chart is too involved for the platform's audience, and Atomm's own Studio already places artwork. A project that already uses a chart shows it and can stop using it. |
| Ranges | Slider plus numeric field | One grey numeric field (drag or type) | The review asked for one control per value. The layer card keeps sliders because they browse a view, and each shows its value as a number. |
| Tips | Guides on the website | A step-by-step walkthrough: one slide per step, dots, Back and Next | Matches the platform's Fabrication Tips dialog. The lake-depth help opens it on its own slide. |

## Canvas overlays

The canvas carries only what the platform allows: view tabs top-centre, Tips top-end, the zoom cluster bottom-start. Map credits share the zoom cluster's row at the bottom-end as light text without a plate. A quick preview refresh shows a small chip in the same row. Loading terrain shows a progress card over the previous preview, with the stage and a Cancel button, so the tabs and Tips stay in reach; in Map view the chip is used instead so the map stays visible. Cancelling an area load keeps the previous terrain and the lead rail offers **Load terrain**. Collapsed, the lead rail becomes a pill that keeps its title.

## Package contents

The Atomm package is the studio alone. With `VITE_SITE_ENV=atomm`, `svelte.config.js` prerenders only `/`, `/studio` and `/attribution` (the credits page the studio links to), the lake and example routes list no entries, and articles render without the site header, guide navigation and footer. `scripts/build/prune-atomm-dist.mjs` then drops the site-only static files listed in `scripts/lib/atomm-site-only.mjs`. What the studio fetches at runtime stays: `data/lake-depth-directory.json` for place search, icons and licence texts. `verify-atomm-dist.mjs --require-sdk-entry` fails if any other page or site-only file is packaged, and CI builds and verifies the package on every run rather than only on `main`.

## Tests

`e2e/atomm.spec.ts` covers the layout, the automatic load (held at the geometry worker to watch or cancel it), the Export view, the walkthrough and the collapsed pill. `App.client.test.ts` covers the embed's terrain flow without a browser.
