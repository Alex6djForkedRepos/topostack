# Atomm listing

- **Immutable generator slug:** `topostack`
- **Card title:** TopoStack
- **Short description:** Turn real terrain into layered laser-cut reliefs and flat topographic engravings.
- **Craft:** Laser, Cutting, Engraving, Relief. If only one selection is allowed, choose Laser.

## Detailed description

Turn a place you love into something you can make. TopoStack transforms real elevation and map data into layered terrain reliefs and flat topographic engravings.

Choose a location, frame your map, and set its physical size. Create a layered relief with adjustable material thickness and vertical exaggeration, or a flat engraving with customizable contour lines. Use a circular or rectangular crop, then add roads, trails, water details, labels, a compass, a scale bar, or your own markers and paths.

Include lake-floor relief using surveyed bathymetry where available. Automatic depth coverage adds the required layers without compressing land relief; optional depth limits and fitting give you control over the stack.

Explore your design in 2D and preview layered projects as a stacked or exploded 3D model. Inspect individual layers before exporting.

When you are ready, use Export to download the files or open the master SVG in xTool Studio. Layered downloads include cut panels, matching engraving panels, and an assembly guide. Flat designs export as SVG artwork at your chosen physical size.

Make a keepsake of a favorite hike, a mountain you climbed, a memorable lake, or the place you call home.

Generate fresh terrain before exporting, then review the artwork, material, and machine settings before fabrication. The opening design is a bundled preview. The gallery and new videos show freshly generated projects from released v0.1.1. These are software previews; physical-build photos are not included.

## Upload media

Use **`assets/topostack-cover-loop-v3.mp4`** as the video cover. It is a silent, approximately six-second H.264 loop at 1600 × 1200 and 60 fps, showing the actual 41-layer Crater Lake model separating and reassembling. `assets/topostack-cover-motion-4x3.png` is the still fallback; `assets/topostack-cover-4x3.png` is an assembled alternate. Titles and the model remain inside the center square for cover cropping.

Use **`assets/topostack-product-showcase-v3.mp4`** as the main gallery video. The 36-second, 30 fps film combines actual terrain animation with readable feature scenes: different places, exploded layers, flat artwork, personalization, lake depth and the real SVG imported into xTool Studio. Both new videos are silent and have fast-start playback.

The nine gallery cards are 1600 × 1200. They combine actual app renders and UI captures with concise captions. The location examples are Crater Lake, Mount Rainier and Point Reyes. The export scene shows the genuine complete-project master SVG in xTool Studio, imported with **Keep size**; it does not imply a completed machine run.

| Order | File | Caption / alt text |
| --- | --- | --- |
| Cover | `assets/topostack-cover-loop-v3.mp4` | Looping software preview of Crater Lake’s actual layered terrain. |
| Video | `assets/topostack-product-showcase-v3.mp4` | A 36-second tour from real terrain to personalized SVG fabrication files. |
| 1 | `assets/topostack-gallery-01-hero.png` | A place, made personal: actual Crater Lake terrain with lake-floor relief. |
| 2 | `assets/topostack-gallery-02-places.png` | Crater Lake, Mount Rainier and Point Reyes demonstrate different landscapes. |
| 3 | `assets/topostack-gallery-03-exploded.png` | Compare the assembled relief with its separated layers. |
| 4 | `assets/topostack-gallery-04-layered-flat.png` | Choose layered relief or flat contour artwork. |
| 5 | `assets/topostack-gallery-05-personalize.png` | An 18 mm star near Wizard Island, with real marker controls. |
| 6 | `assets/topostack-gallery-06-lake-depth.png` | Automatic depth coverage and the actual water-depth controls. |
| 7 | `assets/topostack-gallery-07-export.png` | Real master SVG opened in xTool Studio, alongside export-package contents. |
| 8 | `assets/topostack-gallery-08-workbench.png` | The current workbench with controls, source notices and terrain preview. |
| 9 | `assets/topostack-gallery-09-shapes.png` | Rectangular and circular contour designs at physical size. |

The Crater Lake project is 406.4 × 270.933 mm, with 3.175 mm material, 4× terrain exaggeration and 1.75× depth exaggeration. Automatic depth coverage produces 41 layers without an explicit depth limit or depth fitting. Import `media-project-v4.json` and generate terrain to reproduce it. `media-projects-v5.json` records all three locations and data attribution; `media-storyboard-v3.json` records the film sequence and cover motion.

USGS survey samples are used where available. Crater Lake reports mixed depth coverage: terrain, modeled depths or estimates fill uncovered cells. The depth scene and provenance explain this limitation. Flat artwork shows surface contours, not submerged 3D relief. These images do not represent fabricated physical objects.

**Older capture — historical reference only:** `assets/topostack-exploded-stack-v2.mp4` remains in the bundle at the user’s request. It was captured on 16 September 2026 and shows the former 24-layer fitted model, before the v0.1.1 automatic-depth changes. It is not the new cover or showcase. Its settings and status are retained under `legacyVideo` in `media-provenance.json`. Use the new v3 videos for the current listing.

The bundle contains 14 media files: nine current gallery cards, two still cover alternatives, two current videos and the clearly identified historical video. All current media comes from the released v0.1.1 package; temporary capture files are excluded.

Credits: USGS Crater Lake multibeam bathymetry (public domain); Mapzen Terrain Tiles and their contributing elevation sources; HydroLAKES / GLOBathy; map data © OpenStreetMap contributors, via Protomaps. Full generation attribution is retained in `media-provenance.json`, `media-projects-v5.json` and the app’s exports.

## Craft selection notes

Select Laser, Cutting, Engraving, and Relief wherever multiple choices are supported. Do not select the printing categories. The 3D preview represents stacked sheet construction; TopoStack supplies SVG fabrication files, so 3D is not selected as a printing craft.

## Review notes

The Atomm package opens the terrain workbench directly at its root. The standalone website keeps its homepage. For local editor preview, point Atomm's `local` URL at `/studio`. The embedded workbench follows `layout-3-generate.skeleton.html`: a 320px generation rail, canvas, and 320px parameter rail with a pinned platform export button.

TopoStack uses the Atomm platform export button and registers one export lifecycle hook. Download returns a multi-file fabrication package; Open in Studio returns a single master SVG. All machine-facing SVGs use millimeters at physical size and keep cut, score, and engraving operations in named groups. Cuts use `#FE0002`; score lines, engraving lines, and engraving fills use `#2366FF`. SCORE and ENGRAVE share Atomm’s blue processing group. White marker knockouts remain an additional color group to review in Studio.

The generator requests elevation, OSM-derived vector data, and proxied Geoapify place-search results from the configured TopoStack Cloudflare Worker. Search queries are hashed for a 24-hour response cache and are also processed under Geoapify's privacy terms. The interactive reference map loads OpenFreeMap tiles. No Atomm user profile or token is read or stored. Projects are saved only in the browser's IndexedDB unless the user exports `project.json`.

The UI reads the platform locale once and falls back to English for languages without a translation. Platform toasts are used for generation feedback; no login flow is needed.
