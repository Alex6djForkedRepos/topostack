# Changelog

User-facing changes to TopoStack, newest first. Also at https://topostack.app/changelog with a [feed](https://topostack.app/changelog.xml) for feed readers.

Generated from `changelog/releases.json` by `npm run changelog:prepare`; do not edit by hand. See [docs/changelog.md](docs/changelog.md).

## 0.5.1 (2026-09-24)

### Improved

- **Atomm terrain updates without a Generate step**: Inside Atomm, the studio loads real terrain when it opens and reloads it whenever you choose a place or move the map selection, so there is no Generate button to remember. A new **Export** view shows the file **Open in Studio** sends and lists everything a download includes, and **Tips** now walk through fabrication one step at a time, each with a picture from the studio.

### Fixed

- **Keep Atomm controls reachable and export previews accurate**: Use every preview view in narrow frames and every Tips step on short screens; edit the map from Project setup. Font selection supports native keyboard and touch controls, invalid numbers explain their limits, and sliders show their filled range. Model edits preserve your 3D view, while export previews space operation labels clearly, distinguish scoring from filled engraving and include the same guide fonts as downloads. ([#107](https://github.com/Echo-Foxtrot-Works/topostack/pull/107))
- **Show progress while the Atomm preview refreshes**: The refresh status now shows its actual work stage: preparing map data, then building preview geometry. The step count and stage text stay visible without a looping animation. ([#107](https://github.com/Echo-Foxtrot-Works/topostack/pull/107))

## 0.5.0 (2026-09-23)

### New

- **Carve a lake from a depth chart you have**: Bring a flat chart image or PDF into **Custom data → Depth charts**, select its lake, and prepare contour paths. Review and repair each path, assign depths or elevations, and align the chart to known coordinates before generating a lake floor. Inspect the depth map and representative layers before saving. Charts stay in this browser and apply when you select one and regenerate terrain. ([#89](https://github.com/Echo-Foxtrot-Works/topostack/pull/89))
- **Use your own SVG icons as markers**: Upload an SVG on any marker card to engrave your own symbol: a cabin, a trail logo, a lighthouse. Filled shapes keep their holes, line icons are outlined at their stroke width, and white areas cut through. See [custom markers and paths](https://topostack.app/guides/custom-markers-and-paths). ([#94](https://github.com/Echo-Foxtrot-Works/topostack/pull/94))
- **Place your own graphics on the piece**: Upload an SVG logo, badge or decoration under **Graphics** in the Custom data view, then place it on the piece from a top-down view of the 3D stack: drag to move it, resize it from the corner and turn it from the grip above it. Each placed graphic can be engraved as a filled shape, scored as an outline, or cut out of the sheet it sits on so the sheet below shows through. See [custom graphics](https://topostack.app/guides/custom-graphics). ([#95](https://github.com/Echo-Foxtrot-Works/topostack/pull/95))
- **Verify traced depth charts in 3D**: Depth charts show an interactive 3D lake bed after generation. Rotate, zoom, reset the view, and inspect an exploded stack of representative layers before keeping it. Automatic vertical exaggeration helps reveal shallow basins. A north-up 2D depth map provides another view and remains available when 3D cannot render. Changed inputs mark the preview as out of date. ([#99](https://github.com/Echo-Foxtrot-Works/topostack/pull/99))

### Improved

- **Send feedback without a GitHub account**: The Feedback button now sends your report straight to the maintainer, privately and without signing in. Add an email address if you would like a reply, or leave it blank to stay anonymous. Public GitHub issues remain an option. ([#79](https://github.com/Echo-Foxtrot-Works/topostack/pull/79))
- **Name your markers, trails and boundaries**: A project with twenty markers is easier to work through when they are called something. Type over the number at the top of any marker or path card to name it; the name shows when you hover that marker on the map. Names are your own bookkeeping. Nothing is engraved from them, and renaming something never marks your terrain for regeneration. ([#89](https://github.com/Echo-Foxtrot-Works/topostack/pull/89))
- **Draw trails and boundaries on the map**: Everything you bring to a project now lives in one view. **Custom data** holds depth charts, markers, trails and boundaries, and GPX, KML or GeoJSON import, each in its own sidebar section with the map or chart it works on beside it. Paths can be drawn rather than typed: choose **Draw on map** and click along the route. The next stretch follows your cursor, so you see the line before you place it. Click the first point again to close the shape into a boundary, or double-click or press Enter to finish it as a trail. ([#89](https://github.com/Echo-Foxtrot-Works/topostack/pull/89))
- **Star TopoStack on GitHub from the homepage**: The homepage header, open-source section and footer now link to the GitHub repository, so you can star the project and follow its development in one click. ([#97](https://github.com/Echo-Foxtrot-Works/topostack/pull/97))
- **More intuitive custom data controls**: Collapse any custom data section without switching away from your chart or map, and reopen its tools when needed. Clearer workspace headings, larger map actions, and step-by-step chart guidance make it easier to get started. Long path point lists can now be collapsed after editing. ([#98](https://github.com/Echo-Foxtrot-Works/topostack/pull/98))
- **Preview contour paths before assigning depths**: Prepare paths from a flat chart image or native PDF geometry, then select contours directly on the source chart. Highlighted paths make it easier to inspect each outline while assigning its value, repairing gaps, or excluding chart labels and other unwanted lines. Keyboard and touch selection are supported. ([#98](https://github.com/Echo-Foxtrot-Works/topostack/pull/98))
- **Choose chart lakes with geographic context**: Selectable lake outlines load automatically on opening the map and after panning or zooming, before any search or click. Hover highlights clickable lakes; clicks select the highlighted target directly, including shoreline hits. Missing close-up data triggers a wider lookup. Place results identify towns, show loading feedback, and explain missing outlines. Older requests cannot replace newer selections, and browsing chart lakes leaves the terrain location unchanged. ([#98](https://github.com/Echo-Foxtrot-Works/topostack/pull/98))
- **A clearer, more reliable depth chart workflow**: Follow numbered steps to trace and save a depth chart, assign values in the contour tools, and jump straight from the preview to saving. Uploads no longer overwrite newer work, saved-chart loading errors offer a retry, and elevation charts support values below their datum. Chart selection now clearly reminds you to regenerate terrain. ([#98](https://github.com/Echo-Foxtrot-Works/topostack/pull/98))
- **Guides for custom data and depth charts**: Two new guides cover the **Custom data** view. [Bring your own data](https://topostack.app/guides/custom-data) explains what each section adds, how markers, paths, graphics and charts are saved and shared, and the limits at a glance. [Carve a lake from a depth chart](https://topostack.app/guides/trace-a-depth-chart) walks through tracing a flat chart image or PDF, from choosing the lake to regenerating terrain with it. The studio tour, settings reference, lake and troubleshooting guides now point to both. ([#100](https://github.com/Echo-Foxtrot-Works/topostack/pull/100))
- **Give contour repair its own tools panel**: Contour editing keeps a large source chart on the left and places repair, alignment, and validation tools on the right. Generating depths switches that panel to previews; returning to editing preserves zoom and undo history. Tools scroll independently, with generation controls always within reach.
- **Learn the reviewed depth-chart workflow**: Updated chart instructions cover contour correction, geographic alignment, draft recovery, and layer approval. A separate illustrated guide explains how contours become lake floors, the current compromises, validation limits, and directions for future improvements.
- **Review and correct contours before generating lake depths**: Inspect source contours, correct their values and paths with undo/redo, and align flat charts using known coordinates before generating depths. Native PDF paths can avoid image tracing. Incomplete or conflicting contours block generation, and saving requires a separate layer review. Previously saved charts without review remain available for export but cannot be applied to new terrain generations.
- **Define chart contours directly, including islands and underwater rises**: Prepare paths without three seed points or a uniform interval. Assign each path as the outer shoreline, an island boundary, or a depth contour with a deeper or shallower interior. Local containment checks support multiple basins and rises while rejecting crossing paths and contours inside land. Innermost interiors hold the last contour value unless an explicit bottom or summit is supplied. Island boundaries persist in saved charts and terrain water polygons. Updated the workflow and technical guides.
- **Join contour fragments directly on the chart**: Select an open fragment, choose Join paths, then click or tap the next fragment. The selected source stays highlighted while hovering or focusing a target previews the endpoint connection. Invalid targets explain why they cannot join; Escape and Cancel joining leave the paths unchanged. Joins remain undoable and require fresh path confirmation.
- **Compare chart depths in a responsive workspace**: A large source chart sits beside contour repair tools while editing, then beside previews after generating depths; panels stack on smaller screens. Compare a shaded lake bed, representative wood layers, and a flat depth map. The representative stack is independent of project settings. Custom data no longer shows the terrain generation dock.
- **Zoom and pan depth charts while editing**: The source chart and contour repair tools share the flat and cut-layer viewport, including wheel zoom, touch pinch, drag panning, zoom buttons, and reset. Editing uses source coordinates at every zoom level, and pan gestures do not place points or select contours.
- **Guides share the homepage header and footer**: Guide, example, lake and changelog pages now use the same header and footer as the homepage. The header stays in view as you scroll and keeps **Start creating** one click away, and the footer links to every public page, including privacy and lake depth maps.

### Fixed

- **Your last edit survives a reload or closed tab**: The studio saves your project in your browser as you work, but an edit made in the moment before you reloaded the page or closed the tab could be lost: add a marker and reload straight away, and the marker was gone. The studio now keeps a quick copy of the project as the page closes and restores it when you come back, so the last thing you changed is still there. ([#91](https://github.com/Echo-Foxtrot-Works/topostack/pull/91))
- **Bold text shows correctly in the changelog**: Studio labels in release notes, such as **Move on preview**, now appear in bold on the [changelog](https://topostack.app/changelog) and in its feed instead of showing raw asterisks. ([#92](https://github.com/Echo-Foxtrot-Works/topostack/pull/92))
- **Placement mode opens and closes without a flash**: Moving a title, legend or other annotation on the 3D stack no longer blinks the preview on the way in or out, and no dark band sits behind the **Cancel** and **Done** toolbar. The terrain slides down under the toolbar instead. ([#93](https://github.com/Echo-Foxtrot-Works/topostack/pull/93))
- **Read thousands-separated elevations in vector depth charts**: Vector chart tracing now reads elevations such as `1,020` and `1,028.5 ft`, as printed on USGS reservoir charts. Malformed grouping and large map-grid coordinates remain excluded. Real-chart stress tests and review screenshots document the remaining raster tracing limits.
- **Use shared theme controls in contour editing**: Contour repair now uses the shared buttons, fields, selects, and checkbox styles. The review-draft picker uses a themed action instead of a native file input that widened the sidebar, eliminating horizontal scrolling at desktop and narrow widths.

## 0.4.0 (2026-09-22)

### New

- **Place and size the north arrow, title and scale bar anywhere**: The north arrow, title and scale bar are no longer limited to fixed spots. Choose **Move on preview**: the preview looks straight down on your finished piece, and you drag them anywhere, even across layers, or nudge them with the arrow keys. Drag the corner handle, or press + and −, to resize the north arrow or the title in place. Choose **Done** to engrave them where you left them, or **Cancel** to put them back. See [map details](https://topostack.app/guides/map-details). ([#76](https://github.com/Echo-Foxtrot-Works/topostack/pull/76))

### Fixed

- **Keep annotation placement edits and previews reliable**: Moving a title preserves sidebar text and font changes, and committed positions survive reloads. Placement waits for fonts, shows title backings correctly, keeps resizing within limits, and pauses Undo and Redo until you finish. Controls remain reachable on small screens without covering annotations or conflicting with preview zoom controls. ([#76](https://github.com/Echo-Foxtrot-Works/topostack/pull/76))
- **Scale bar no longer hidden under upper layers**: On layered reliefs the scale bar was engraved on the bottom sheet only, so the sheets above could cover most of it. It is now engraved on whichever sheets it crosses, like the north arrow. ([#76](https://github.com/Echo-Foxtrot-Works/topostack/pull/76))

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
