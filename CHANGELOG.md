# Changelog

User-facing changes to TopoStack, newest first. Also at https://topostack.app/changelog with a [feed](https://topostack.app/changelog.xml) for feed readers.

Generated from `changelog/releases.json` by `npm run changelog:prepare`; do not edit by hand. See [docs/changelog.md](docs/changelog.md).

## 0.2.0 (2026-09-18)

### New

- **Split large maps to fit your laser bed**: Set a machine work area and each layer is cut into bed-sized pieces along staggered seams, with puzzle tabs and assembly ids. See [the guide](https://topostack.app/guides/split-large-maps). ([#34](https://github.com/Echo-Foxtrot-Works/topostack/pull/34))
- **Water paint templates**: Export registered paper stencils that leave only the water open on each layer, so lakes and rivers are easy to paint. See [the guide](https://topostack.app/guides/water-paint-templates). ([#37](https://github.com/Echo-Foxtrot-Works/topostack/pull/37))

### Improved

- **Reset asks before discarding a project**: Reset now confirms first, says what it clears, and can be undone. The Crater Lake preview comes back instantly without generating terrain. ([#34](https://github.com/Echo-Foxtrot-Works/topostack/pull/34))
- **Crisper marker symbols**: Pins are true teardrops with an engraved eye, circles are smoother, and crosses cut as one outline instead of doubling where the bars meet. ([#35](https://github.com/Echo-Foxtrot-Works/topostack/pull/35))
- **Studio layout touch-ups**: The aspect-lock controls sit in a small corner card that no longer hides warnings, and engraving font samples are centered in their swatches. ([#35](https://github.com/Echo-Foxtrot-Works/topostack/pull/35))
- **TopoStack moved to topostack.app**: The site and studio now live at topostack.app, and links to the old address redirect to the same page. ([#38](https://github.com/Echo-Foxtrot-Works/topostack/pull/38))

## 0.1.2 (2026-09-17)

### New

- **Canadian high-resolution terrain**: Projects in covered parts of Canada now use NRCan HRDEM elevation data, with sharper ridges and valleys than the global terrain. ([#29](https://github.com/Echo-Foxtrot-Works/topostack/pull/29))
- **Guides for every part of the studio**: A new [guides hub](https://topostack.app/guides) with a studio tour, map details, custom markers and paths, a settings reference, what each export file contains, and troubleshooting, all with sidebar navigation that works on phones.
- **Send feedback from any page**: A feedback tab on the site and in the studio opens a prefilled bug report or idea on GitHub. ([#29](https://github.com/Echo-Foxtrot-Works/topostack/pull/29))
- **Size each marker**: Custom markers can each have their own size, and they stay visible on every stacked layer they sit on instead of disappearing under the layer above.

### Fixed

- **Smoother lake shorelines**: Lake edges no longer look jagged, and depth blends evenly where surveyed data meets modeled depth. ([#29](https://github.com/Echo-Foxtrot-Works/topostack/pull/29))
- **No more elevation spikes along shorelines**: Elevation detail now follows the map crop instead of the camera zoom, which removes false cliffs and pits that coarse terrain tiles put along some lake shores.
- **Crash on some lake shorelines**: Generation no longer fails with a degenerate-segment error when a shoreline spike folds back onto itself.
- **Engraving preview follows size and shape edits**: Changing the physical size or crop shape of a flat engraving no longer frames the old contours in the preview.
- **North arrow placement**: The north arrow lands on terrain that is actually exposed on its layer instead of under the layer above.
- **Transportation labels and the 3D coordinate grid**: Road and trail labels are placed more reliably, and the latitude/longitude grid shows in the 3D preview.
- **Atomm layout and dark theme fixes**: Inside Atomm, the studio fits the platform panel, selected text stays readable in dark themes, and fabrication exports and lake depths were fixed.

## 0.1.1 (2026-09-16)

### New

- **Resize the map selection on the map**: Drag the selection's edges and corners directly on the map, and lock its aspect ratio to the physical size you set.
- **Lake depth shaped by the surrounding terrain**: Lakes without a survey get floors modeled from the slopes around them, and the studio explains where each depth comes from. See [how lake depths work](https://topostack.app/guides/how-lake-depths-work).
- **Sources and attribution page**: A [single page](https://topostack.app/attribution) lists every terrain, map, lake-depth and software source with its credits and license, linked from the studio.

### Improved

- **Clearer location search**: Search results keep separate lakes that share a name and drop duplicate survey records.
- **Faster SVG preview**: Panning and zooming the cut-layer and engraving previews stays smooth, and close zoom renders crisply.

### Fixed

- **Missing lake outlines**: Lakes that had no outline now get one from provider data, with OpenStreetMap as a fallback, so water shows up in the layers and the engraving. ([#28](https://github.com/Echo-Foxtrot-Works/topostack/pull/28))
- **Circular crops and the preview toolbar**: Circular maps keep their proportions, and the preview mode buttons line up without their icons shrinking.

## 0.1.0 (2026-09-16)

### New

- **First tagged release**: TopoStack's first versioned release, after four weeks of public development that began on August 19. Everything below shipped in that time.
- **Layered laser-cut reliefs**: Turn real elevation data into a stack of cut layers. The number of sheets follows from the terrain's relief, the map scale, vertical exaggeration and your material thickness. See [the layered map guide](https://topostack.app/guides/laser-cut-topographic-map).
- **Flat topographic engravings**: Export a single contour SVG at physical size, with contour density, index contours, linework widths, state and province boundaries and a latitude/longitude grid. See [the engraving guide](https://topostack.app/guides/topographic-map-engraving).
- **Lake depth**: Layered maps carve lake floors from USGS and state surveys, NOAA Great Lakes bathymetry, or a modeled depth where no survey exists, and fit surveyed depths to the shoreline.
- **Searchable lake depth directory**: Find which lakes have surveyed depth data by name, region or source, and open one straight in the studio. See [the directory](https://topostack.app/guides/lake-depth-data).
- **Map details**: Add roads, trails and their labels, water outlines and fill patterns, collision-free elevation labels, a scale bar, and a choice of north arrow designs.
- **Custom markers and paths**: Place your own markers, trails and boundaries by coordinates, with styled pins that stay anchored where you put them.
- **Fabrication-ready cut files**: Layered exports compensate for laser kerf, nest smaller pieces into the waste of larger sheets without breaking glue surfaces, and engrave where the next layer goes as an assembly guide.
- **Previews and exports**: Check a project on the map, as 2D cut layers, as an engraving, or as a stacked or exploded 3D model, then download the complete project, single artwork files, or just the settings.
- **Homepage and studio**: An illustrated homepage explains the two workflows, and the editor lives at `/studio` with light and dark themes and layouts for phones and tablets.
- **Open in Atomm**: TopoStack runs inside the Atomm platform and hands finished artwork to its studio.

### Fixed

- **Terrain depth spikes**: Isolated bad values in the upstream terrain are repaired before they reach your layers, and every repair is noted in the export.
- **Continuous rivers and smooth contours**: Rivers stay continuous across terrain layers, and contour corners are smoothed correctly.
- **Crop aspect ratios**: Rectangular and circular crops keep the proportions of the physical size you set.
