<script lang="ts">
  import { base } from "$app/paths";
  import Article from "$lib/site/Article.svelte";
</script>

<Article title="Carve a lake from a depth chart" intro="Most lakes have no digital survey, so TopoStack models their floor from the shoreline. If you have a printed depth chart of your lake, a scan, a photo or a PDF, you can trace it instead, and the layers follow the contours on the chart.">
  <h2>What you need</h2>
  <ul>
    <li>A picture of the chart: PNG, JPEG, WebP or PDF. A straight-on scan or screenshot works best; a phone photo taken square to the page works too.</li>
    <li>The chart's units, and whether its numbers are depths below the surface or heights above a datum.</li>
    <li>At least three printed contour values you can read on the chart, on different contour lines.</li>
  </ul>
  <p>Tracing a chart needs no terrain and no map area, so you can build charts before you frame anything. Depth charts are for layered maps; a flat engraving has no lake floor to carve, so its <strong>Custom data</strong> view has no <strong>Depth charts</strong> section.</p>
  <p>Check first whether your lake already has surveyed depths in the <a href={`${base}/guides/lake-depth-data`}>lake depth directory</a>. A lake with a published survey already carves from it, and the chart search names it rather than listing it.</p>

  <h2>1. Choose the lake</h2>
  <ol>
    <li>Select <strong>Custom data</strong> above the preview, then open <strong>Depth charts</strong> in the sidebar.</li>
    <li>Search for the lake by name, or for a town beside it. Many lakes are unnamed in the lake data, so each result lists its size and how far it lies from the place you searched.</li>
    <li>Choose a lake in the list, or click its outline on the map. Outlines appear as you pan and zoom; zoom in if the map asks you to.</li>
  </ol>
  <p>Small lakes that only the map draws, listed as “Lake from the map”, can take a chart too. Browsing lakes here never moves your project's map area.</p>

  <h2>2. Upload the chart</h2>
  <p>Select <strong>Choose a chart picture or PDF</strong>. Crop the picture to the lake and its contours before uploading, leaving out legends, title blocks and page borders: the lake's shoreline is how TopoStack places the chart, and extra ink gets in the way. Large pictures are reduced to 2,400 pixels on their longer side.</p>
  <p>For a PDF with several pages, choose the page the chart is on. Some PDFs store their pictures in a form the browser cannot draw, and the page comes out blank; save the chart as a PNG or JPEG and upload that instead.</p>
  <p>Once the picture loads, TopoStack finds its contour lines in the background. Hover over a line to see the path it traced.</p>

  <h2>3. Set the chart units</h2>
  <ul>
    <li><strong>Depths are in</strong>: <strong>Feet</strong>, <strong>Metres</strong> or <strong>Fathoms</strong>, as printed on the chart.</li>
    <li><strong>The chart prints</strong>: <strong>Depth below the surface</strong> for most fishing and lake association charts, or <strong>Height above a datum</strong> when the contours are elevations. For elevations, enter the water's <strong>Surface level</strong> in the same units.</li>
    <li><strong>Contour interval</strong>: the difference between neighbouring contours, such as 5 or 10. Leave it blank and TopoStack infers it from the depths you place.</li>
  </ul>

  <h2>4. Place depths</h2>
  <p>A guide beside the chart counts you through the points:</p>
  <ol>
    <li>Click a labelled contour line. The line stays highlighted so you can check it is the one you meant.</li>
    <li>Type the value printed on that line in the card that opens, and select <strong>Confirm &amp; next</strong>.</li>
    <li>Repeat on different contour lines, at least three in all. Spread them across the lake, from a shallow line to a deep one.</li>
  </ol>
  <p>One depth cannot say which way the lake deepens, which is why TopoStack asks for several. Add more points where a chart has separate basins or humps. Select a numbered point to change its value, or <strong>Undo last point</strong> to remove the latest one. Press Escape or <strong>Cancel</strong> to drop a point you have not confirmed.</p>
  <p>Depths are always typed by you, never read from the picture by machine. A misread number would carve a lake bed that looks right but is wrong.</p>
  <p>To place depths from the keyboard, focus the chart, move the crosshair with the arrow keys (hold Shift for bigger steps), and press Enter to open the card for that point. On a touch screen, tap a line to preview it.</p>

  <h2>5. Trace and check the result</h2>
  <p>Select <strong>Trace chart</strong>. The traced lake bed appears below the chart as a <strong>3D lake bed</strong> you can turn and zoom. Drag to rotate, scroll or pinch to zoom, and select <strong>Reset view</strong> to face north again. The exaggeration choices, from true scale to 20×, deepen the basin so its shape is easier to see; they change only this preview, not your map. Select <strong>2D depth map</strong> for a flat, north-up view shaded from light blue in the shallows to dark blue at depth, with gaps where the chart gave no data. The 2D map also shows when your browser cannot draw 3D.</p>
  <p>Compare the basin and where it sits with your chart, then check the three readings beside it:</p>
  <ul>
    <li><strong>Deepest</strong>: the deepest point, in the chart's units. Compare it with the deepest sounding on the chart.</li>
    <li><strong>Contours levelled</strong>: the share of traced contours that got a depth. Below 100%, place another depth on a line that was missed.</li>
    <li><strong>Fit to the lake's shape</strong>: how closely the chart's shoreline matches the lake's known outline. A low fit means the chart may be distorted, cropped too tightly, or of a different lake.</li>
  </ul>
  <p>Some lakes fit their chart more than one way, such as an oval that looks the same turned end to end. The studio says so; compare the preview with the chart and select <strong>Try another placement</strong> until the deep end is where the chart puts it.</p>
  <p>Changing a setting or a depth after tracing marks the result out of date. Select <strong>Trace again</strong> to update it.</p>

  <h2>6. Keep the chart</h2>
  <p>Select <strong>Review and save chart</strong>, or scroll to <strong>5 · Save your chart</strong> in the sidebar. Give it a <strong>Chart name</strong>, say <strong>Where this chart came from</strong>, and select <strong>Keep this chart</strong>. It joins <strong>Your charts</strong>, the list of charts saved in this browser.</p>
  <p class="note">Keeping a chart does not change your project. Only the next step does.</p>

  <h2>7. Use it for the lake and regenerate</h2>
  <ol>
    <li>In <strong>Your charts</strong>, select <strong>Use for</strong> beside the chart, followed by the lake's name.</li>
    <li>Frame the lake in <strong>Map</strong> if you have not already, and select <strong>Regenerate terrain</strong>.</li>
  </ol>
  <p>The lake floor now follows the chart wherever it has depths, and the preview warns that some lake floors come from a traced depth chart. Parts of the lake the chart does not cover keep their surveyed or modeled depths. A lake using a chart no longer offers a <strong>Maximum depth</strong> in <strong>Map details</strong>; <strong>Stop using it</strong> there, or <strong>Stop using</strong> in <strong>Your charts</strong>, returns it to its other depths.</p>
  <p>You can also start from <strong>Map details</strong>: under <strong>Water depth</strong>, each modeled lake offers <strong>Use a depth chart…</strong>, which opens this section.</p>

  <h2>Where charts are kept</h2>
  <ul>
    <li>Charts stay in this browser. Nothing is uploaded to TopoStack, and the picture itself is not kept, only what was traced from it.</li>
    <li>Exported <strong>Project settings</strong> include the charts the project uses, so importing the file on another computer brings them along. Project files with charts can be up to 24 MB.</li>
    <li>Share links do not carry charts. Someone opening your link gets the lake's surveyed or modeled depths instead. If a project names a chart this browser does not have, <strong>Your charts</strong> lists it with a way to stop using it.</li>
    <li>Deleting a chart asks you to press <strong>Delete</strong> twice. A lake that was using it goes back to its other depths.</li>
  </ul>

  <h2>Tips for a clean trace</h2>
  <ul>
    <li>Rotate a sideways scan upright before uploading. A chart that is only slightly skewed still places correctly.</li>
    <li>If a contour is broken by printed numbers, place a depth near the gap; labels help the tracer join the line.</li>
    <li>When no contour lines are found, you can still click points on the printed lines by hand.</li>
    <li>Choose <strong>Start this chart again</strong> to try a different picture of the same lake, or <strong>Choose another</strong> to start over with a different lake.</li>
  </ul>

  <h2>Before you cut</h2>
  <p class="note">A traced lake floor is only as accurate as the chart and the depths you placed. Step through the <strong>Cut layers</strong> view and compare the deepest sheets with the chart before cutting. Water levels change over the years, so an old chart may not match today's lake.</p>

  <h2>Next steps</h2>
  <p>Finish the map with the <a href={`${base}/guides/custom-lake-depth-map`}>custom lake depth map guide</a>, or read <a href={`${base}/guides/how-lake-depths-work`}>how lake depths work</a> to see how charted, surveyed and modeled depths fit together.</p>
</Article>
