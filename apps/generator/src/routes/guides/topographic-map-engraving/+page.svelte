<script lang="ts">
  import { base } from "$app/paths";
  import Article from "../../../lib/Article.svelte";
</script>

<Article title="Create a topographic map SVG for laser engraving" intro="Draw a landscape with contour lines on one surface. TopoStack's flat engraving workflow exports one SVG at your chosen physical size, with optional roads, trails, water and labels.">
  <h2>Choose flat engraving</h2>
  <p><a href={`${base}/studio`}>Open the studio</a>, choose a location and select <strong>Flat engraving</strong>. Set a rectangular or circular crop and the artwork's width and height. This is useful when you want a contour drawing rather than a stack of cut sheets.</p>
  <h2>Balance contour density and readability</h2>
  <p>The contour density control supports 4–40 lines across the elevation range. Start with a moderate count, then increase it if the terrain needs more detail. Tight slopes produce close lines, so inspect them at your finished size.</p>
  <p>Index contours emphasize every chosen interval with a stronger line. Adjust their cadence to help readers follow the landscape. The density setting divides the selected elevation range; it is not a fixed elevation interval that stays the same between different places.</p>
  <h2>Add context without crowding the contours</h2>
  <p>Roads, trails, water outlines, state or province boundaries, a coordinate grid, elevation labels, a compass and a scale bar are optional. Water can use lines, ripples or dots, or remain outline-only. Turn off details that compete with the shape of the terrain.</p>
  <p>Choose a Fine, Balanced or Bold linework preset, then adjust individual widths as needed. These are SVG stroke widths in physical millimeters. Actual burn width also depends on your laser, material and how your software processes vector strokes.</p>
  <h2>Generate, preview and export</h2>
  <ol>
    <li>Select <strong>Generate terrain</strong> to fetch real elevation and the requested map details.</li>
    <li>Inspect the flat engraving preview. If data is unavailable or settings are stale, resolve the message before exporting.</li>
    <li>Open <strong>Export</strong> and choose the engraving artwork or complete project download.</li>
    <li>Import the SVG into your laser software and confirm its physical dimensions and engraving operation.</li>
  </ol>
  <p>The primary file ends in <strong>-engraving.svg</strong>. It contains a black <strong>ENGRAVE</strong> group with named detail groups and no CUT or SCORE groups. The complete project also includes settings, a fabrication README and attribution.</p>
  <h2>Does flat engraving use material thickness or lake depth?</h2>
  <p>No. Sheet thickness, vertical exaggeration, modeled water depth, nesting, kerf and assembly guides belong to layered relief. Flat engraving controls the contour drawing on one surface.</p>
  <h2>Can I save the project and return later?</h2>
  <p>Settings are saved in this browser. Export a project-settings JSON backup to move them to another device or keep a separate copy. Imported or restored settings need fresh terrain generation before artwork export. Clearing browser storage removes the local settings.</p>
  <p class="note">A successful SVG export prepares artwork, not machine settings. Verify scale and operation mapping and make a small test on your material before engraving the full piece.</p>
  <p>Explore the <a href={`${base}/examples/crater-lake`}>Crater Lake example</a>, or see <a href={`${base}/guides/laser-cut-topographic-map`}>how to make a layered topographic map</a>.</p>
</Article>
