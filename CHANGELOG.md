# Changelog

User-facing changes to TopoStack, newest first. Also at https://topostack.app/changelog with a [feed](https://topostack.app/changelog.xml) for feed readers.

Generated from `changelog/releases.json` by `npm run changelog:prepare`; do not edit by hand. See [docs/changelog.md](docs/changelog.md).

## 0.3.0 (2026-09-21)

### New

- **Undo and redo shortcuts**: Press `Ctrl+Z` and `Ctrl+Shift+Z` (`Cmd` on a Mac) to step back and forward through edits. Advice about empty layers is also clearer. ([#52](https://github.com/Echo-Foxtrot-Works/topostack/pull/52))
- **Share links**: Copy a link that opens your design, with its place and settings, straight in the studio. ([#53](https://github.com/Echo-Foxtrot-Works/topostack/pull/53))
- **Import GPX, KML and GeoJSON**: Bring tracks, routes and waypoints from other apps into a project as custom paths and markers. See [custom markers and paths](https://topostack.app/guides/custom-markers-and-paths). ([#54](https://github.com/Echo-Foxtrot-Works/topostack/pull/54))
- **Place markers by clicking the map**: Turn on Place on map in custom data and click to drop pins; drag any marker on the map to move it. ([#55](https://github.com/Echo-Foxtrot-Works/topostack/pull/55))
- **Engraved title plaque**: Engrave up to three lines, such as a place name, date and route, anchored in any corner or edge, with contours and roads cleared beneath the letters. ([#56](https://github.com/Echo-Foxtrot-Works/topostack/pull/56))
- **Lake depth map pages**: Browse [surveyed lakes by state and county](https://topostack.app/lakes) and open any of them in the studio, or follow the new guide to [making a custom lake depth map](https://topostack.app/guides/custom-lake-depth-map). ([#58](https://github.com/Echo-Foxtrot-Works/topostack/pull/58))
- **Example gallery**: An [example gallery](https://topostack.app/examples) shows finished projects, from the Grand Canyon and Yosemite Valley to Mount Fuji, the Matterhorn and Lake Tahoe, each with its render and a project file you can import. ([#59](https://github.com/Echo-Foxtrot-Works/topostack/pull/59))
- **Changelog**: See what changed in each release on the [changelog](https://topostack.app/changelog), or subscribe to its feed in any feed reader. The studio marks new releases in its menu. ([#62](https://github.com/Echo-Foxtrot-Works/topostack/pull/62))
- **Real typefaces for labels and titles**: Choose from eight new engraving fonts: four single-line fonts (Hershey Sans, Serif and Script, Relief SingleLine) that trace each letter once, and four filled typefaces (Jost, Oswald, Lora, Roboto Slab). They support lowercase and most accented letters. The title can now have its own font. See [map details](https://topostack.app/guides/map-details). ([#73](https://github.com/Echo-Foxtrot-Works/topostack/pull/73))

### Improved

- **Directory lakes open ready to preview**: Opening a lake from the directory or a lake page generates its terrain straight away instead of waiting for you to press Generate. ([#61](https://github.com/Echo-Foxtrot-Works/topostack/pull/61))
- **A calmer studio header**: Import, share link and reset now live in a menu beside the project name. The color scheme, what's new, guides and home links sit behind one ⋯ button. A dot on Export shows when your project is ready, and the layer and panel counts moved into the readout above the preview. See the [studio tour](https://topostack.app/guides/studio-tour). ([#64](https://github.com/Echo-Foxtrot-Works/topostack/pull/64))
- **A simpler Export dialog**: Export now leads with one recommended download, the complete project, and says what's in it. Single SVGs, panel bundles, paint templates and the assembly guide are listed under Individual files, with a note on when to use each. See [export files](https://topostack.app/guides/export-files). ([#65](https://github.com/Echo-Foxtrot-Works/topostack/pull/65))
- **A step-by-step assembly booklet**: The assembly guide is now a printable booklet that opens in any browser: finished size and materials, a checklist of sheets to cut, and one illustrated step per layer showing where it goes, which sheet its pieces come from, and where split pieces fit. See [export files](https://topostack.app/guides/export-files). ([#66](https://github.com/Echo-Foxtrot-Works/topostack/pull/66))

### Fixed

- **Lake Tahoe survey no longer sheared**: The Lake Tahoe depth survey lines up with the shoreline again; a padding error had shifted its rows. ([#60](https://github.com/Echo-Foxtrot-Works/topostack/pull/60))

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
