# Atomm Local Debug validation — 2026-09-24

Used the signed-in Developer Console, Local Debug section for TopoStack, with `http://localhost:4182`. Served the production Atomm dist corresponding to the rebuilt 0.5.1 ZIP; no mocks or SDK substitutions. No artifact upload or review submission was performed.

## Observed passes

- The real platform SDK initialized inside the Atomm host. Export menu and simulated billing/cooldown appeared.
- Real Crater Lake terrain generated: 12 layers, 9 cut panels. Production terrain, lake outlines, bathymetry and OSM requests returned 200/206; no CORS/CSP failures appeared for these requests.
- Export Preview rendered the actual master SVG and listed 23 download files (1.6 MB), master SVG 582 KB, with cut/score legend.
- Open in Studio invoked Atomm's actual Export Settings dialog. It parsed 362 elements: 59 red-line elements (#FE0002), 303 blue-line elements (#2366FF). The defaults were Cut and Score respectively.
- Selected P2, Process on slats, and 3mm birch plywood. Machine/mode/material services returned 200. Open with parameters became enabled.
- Download invoked the real SDK hook and showed Download ready / 23 files prepared, then the platform's simulated export cooldown. Browser automation could not inspect the downloaded archive on disk, so this does not independently certify saved-file contents.
- Inspected the rendered Export layout and filled slider. Collapsing the project rail retained the Terrain project title. All seven Tips steps remained navigable at a 960×544 outer viewport; Back and Done remained visible with the body scrolling.

## Observations and limits

Atomm's own account bootstrap logged token validation/utoken errors, including updateShopifyUser; these did not block the tested local preview, material services, or export dialog. Three.js logged a non-blocking PCFSoftShadowMap deprecation and automatically used PCFShadowMap.

Did not launch the native xTool Studio application or run a machine. Developer mode explicitly simulates credits; production billing is not validated. Atomm-hosted artifact CSP/CORS and final review approval remain separate from localhost validation. The local preview is left available on port 4182.
