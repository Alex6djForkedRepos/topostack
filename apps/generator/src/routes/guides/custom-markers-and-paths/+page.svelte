<script lang="ts">
  import { base } from "$app/paths";
  import Article from "../../../lib/Article.svelte";
</script>

<Article title="Add custom markers, trails and boundaries" intro="Mark a summit you climbed, a cabin, or the route you hiked. Custom Data engraves your own points and paths from latitude and longitude.">
  <h2>What you need</h2>
  <p>Coordinates in decimal degrees, such as <code>42.9446, -122.1090</code>. Latitudes south of the equator and longitudes west of Greenwich are negative. You can copy coordinates from most online maps, or from a GPS track exported by your hiking app.</p>

  <h2>1. Add a marker</h2>
  <ol>
    <li>Open <strong>Custom Data</strong> and select <strong>Add marker</strong>. The marker starts at the center of your map.</li>
    <li>Enter its <strong>Latitude</strong> and <strong>Longitude</strong>.</li>
    <li>Choose a symbol: <strong>Pin</strong>, <strong>Circle</strong>, <strong>Triangle</strong>, <strong>Star</strong> or <strong>Cross</strong>.</li>
  </ol>
  <p>Markers are engraved about 8 mm across. Lines beneath a marker are cleared for about 1.2 mm around it so the symbol stays readable. In layered output, a marker is engraved on the highest sheet that covers its location, so it appears on the visible surface after assembly.</p>

  <p>Set each marker’s <strong>Size</strong> in your selected units (1–200 mm; default 8 mm). On a layered map, the symbol spans the exposed faces of the stack so upper sheets do not cover it.</p>

  <h2>2. Add a trail or boundary</h2>
  <ol>
    <li>Select <strong>Add path</strong>. A new path starts as a short <strong>Trail</strong> at the map center; choose <strong>Boundary</strong> instead if you prefer.</li>
    <li>Enter the <strong>Latitude</strong> and <strong>Longitude</strong> of each point along the route, in order.</li>
    <li>Select <strong>Add point</strong> for each further point. A new point starts at the previous point's location. A path needs at least two points.</li>
  </ol>
  <p>Trails use the trail width and <strong>Trail pattern</strong> from <strong>Linework</strong>; boundaries use the boundary width and are dashed. Custom paths are engraved even when the built-in <strong>Trails</strong> or <strong>State / province boundaries</strong> are turned off, so you can show only your own route.</p>

  <h2>3. Check the result</h2>
  <p>Custom data updates the preview without regenerating terrain. Inspect it at your finished size:</p>
  <ul>
    <li>Markers and path sections outside the framed area stay saved in the project but are not engraved.</li>
    <li>Paths follow straight lines between points, so add more points where a route curves.</li>
    <li>Markers close together, or near labels and the north arrow, can crowd each other.</li>
  </ul>

  <h2>Limits</h2>
  <ul>
    <li>Up to 250 markers and 250 paths per project.</li>
    <li>Up to 2,000 points in one path, and 10,000 path points in total.</li>
  </ul>
  <p>For a long recorded track, keep only the points needed to show its shape.</p>

  <h2>Keeping your custom data</h2>
  <p>Markers and paths are saved with the project in this browser and included in exported project settings. They are not included in usage events or in optional feedback diagnostics.</p>

  <h2>Next steps</h2>
  <p>Adjust line widths in <a href={`${base}/guides/map-details`}>map details and linework</a>, then generate and export with the <a href={`${base}/guides/laser-cut-topographic-map`}>layered map guide</a> or the <a href={`${base}/guides/topographic-map-engraving`}>engraving guide</a>.</p>
</Article>
