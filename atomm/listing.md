# Atomm listing

- **Immutable generator slug:** `topostack`
- **Card title:** TopoStack
- **Short description:** Turn real terrain into layered laser-cut reliefs and flat topographic engravings.
- **Craft:** Laser, Cutting, Engraving, Relief. If only one selection is allowed, choose Laser.

## Detailed description

Turn a place you love into something you can make. TopoStack transforms real elevation and map data into layered terrain reliefs and flat topographic engravings.

Choose a location, frame your map, and set its physical size. Create a layered relief with adjustable material thickness and vertical exaggeration, or a flat engraving with customizable contour lines. Use a circular or rectangular crop, then add roads, trails, water details, labels, a compass, a scale bar, or your own markers and paths.

Include lake-floor relief using surveyed bathymetry where available, with depth exaggeration and layer-fitting controls.

Explore your design in 2D and preview layered projects as a stacked or exploded 3D model. Inspect individual layers before exporting.

When you are ready, use Export to download the files or open the master SVG in xTool Studio. Layered downloads include cut panels, matching engraving panels, and an assembly guide. Flat designs export as SVG artwork at your chosen physical size.

Make a keepsake of a favorite hike, a mountain you climbed, a memorable lake, or the place you call home.

Generate fresh terrain before exporting, then review the artwork, material, and machine settings before fabrication. The opening design is a bundled preview. The gallery shows a freshly generated Crater Lake project, including USGS surveyed bathymetry in the layered views. The cover uses an AI-assisted workshop setting based on the app rendering.

## Upload media

Upload the cover separately as the card cover. These images were captured from the current app after **Generate terrain**, rather than from its bundled preview. The recommended cover is an AI-assisted workshop presentation based on the app’s rendered 3D canvas, not a photograph of a manufactured piece. It is 1448 × 1086 PNG (4:3). The nine gallery images remain direct app screenshots at 1600 × 1200. All images are below 15 MB. The original canvas capture is retained as an alternate cover.

The regenerated project loaded `usgs-crater-lake-v1` successfully (`bathymetryStatus: available`). Crater Lake’s geometry reports `depthSource: mixed`: measured lake-floor data is used where covered, with existing terrain or modeled depth filling uncovered cells. The gallery does not imply complete survey coverage. Flat engraving shows surface contour artwork, not submerged 3D relief.

Suggested gallery order:

| Order | File | Caption / alt text |
| --- | --- | --- |
| Cover | `assets/topostack-cover-workshop-v2-4x3.png` | AI-assisted workshop presentation of Crater Lake terrain, with a larger tabletop scale and approximately ⅛-inch plywood layers. |
| Alternate cover | `assets/topostack-cover-4x3.png` | Direct capture of the app’s regenerated Crater Lake model with USGS lake-floor bathymetry. |
| 1 | `assets/topostack-gallery-01-3d.png` | Assembled terrain relief showing Crater Lake’s surveyed underwater features. |
| 2 | `assets/topostack-gallery-04-exploded.png` | Exploded 3D view separates the physical sheets for a clearer look at the terrain layers. |
| 3 | `assets/topostack-gallery-05-surveyed-depth.png` | Water-depth controls alongside the regenerated lake basin: depth exaggeration, layer fitting, and survey-data guidance. |
| 4 | `assets/topostack-gallery-06-terrain-settings.png` | Adjust vertical exaggeration and material thickness, with a calculated layer count and stack height. |
| 5 | `assets/topostack-gallery-02-cut-layers.png` | Inspect an individual layer below the lake surface in the 2D cut preview. |
| 6 | `assets/topostack-gallery-07-map-location.png` | Frame the project on an interactive map of Crater Lake. |
| 7 | `assets/topostack-gallery-03-flat-engraving.png` | Switch to flat engraving and customize contour artwork at physical size. |
| 8 | `assets/topostack-gallery-08-custom-marker.png` | Add a coordinate-based marker near Wizard Island to personalize the design. |
| 9 | `assets/topostack-gallery-09-circular-design.png` | Use a circular crop for a different presentation of the same terrain. |

Nine gallery files are supplied, within the 20-file limit. Video is optional and is not included. `media-provenance.json` records the generation sources and settings used for the initial layered capture; subsequent screenshots demonstrate UI changes to that project.

Credits: USGS Crater Lake multibeam bathymetry (public domain); Mapzen Terrain Tiles and their contributing elevation sources; HydroLAKES / GLOBathy; map data © OpenStreetMap contributors, via Protomaps. The map view also displays its tile attribution. Full generation attribution is retained in `media-provenance.json` and the app’s exports.

## Craft selection notes

Select Laser, Cutting, Engraving, and Relief wherever multiple choices are supported. Do not select the printing categories. The 3D preview represents stacked sheet construction; TopoStack supplies SVG fabrication files, so 3D is not selected as a printing craft.

## Review notes

The Atomm package opens the terrain workbench directly at its root. The standalone website keeps its homepage. For local editor preview, point Atomm's `local` URL at `/studio`. The embedded workbench follows `layout-3-generate.skeleton.html`: a 320px generation rail, canvas, and 320px parameter rail with a pinned platform export button.

TopoStack uses the Atomm platform export button and registers one export lifecycle hook. Download returns a multi-file fabrication package; Open in Studio returns a single master SVG. All machine-facing SVGs use millimeters at physical size and keep cut, score, and engraving operations in named groups. Cuts use `#FE0002`; score lines, engraving lines, and engraving fills use `#2366FF`. SCORE and ENGRAVE share Atomm’s blue processing group. White marker knockouts remain an additional color group to review in Studio.

The generator requests elevation, OSM-derived vector data, and proxied Geoapify place-search results from the configured TopoStack Cloudflare Worker. Search queries are hashed for a 24-hour response cache and are also processed under Geoapify's privacy terms. The interactive reference map loads OpenFreeMap tiles. No Atomm user profile or token is read or stored. Projects are saved only in the browser's IndexedDB unless the user exports `project.json`.

The UI reads the platform locale once and falls back to English for languages without a translation. Platform toasts are used for generation feedback; no login flow is needed.
