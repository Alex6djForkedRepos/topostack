<script lang="ts">
  import { base } from "$app/paths";
  import Article from "../../../lib/Article.svelte";
</script>

<Article title="Explore a Crater Lake topographic map" intro="Start with the landscape already waiting in TopoStack. The Crater Lake preview shows how real elevation and map details become a layered terrain project.">
  <figure>
    <img src={`${base}/images/studio-crater-lake.png`} width="1280" height="900" alt="Freshly generated Crater Lake relief in TopoStack with USGS surveyed lake-floor bathymetry." />
    <figcaption>Freshly generated Crater Lake relief with USGS surveyed lake-floor data where available. Gaps use existing terrain or modeled depths; depth is exaggerated.</figcaption>
  </figure>
  <h2>What you need</h2>
  <p>A browser with an internet connection. To make the piece, add 3.175 mm (1/8 in) sheet material and laser software that can import SVG files.</p>
  <h2>Recreate the pictured project</h2>
  <ol>
    <li><a href={`${base}/studio`}>Open the terrain studio</a>. A new browser starts with the Crater Lake preview. If a saved project opens instead, choose the <strong>Crater Lake, Oregon, USA</strong> location preset and frame the whole caldera rim on the map.</li>
    <li>Select <strong>Layered</strong>. In <strong>Cut size</strong>, choose a rectangle 406.4 mm wide by 270.933 mm high (16 × 10.667 in). In <strong>Terrain layers</strong>, enter 3.175 mm sheet material.</li>
    <li>Set <strong>Vertical exaggeration</strong> to 4×. The studio fits the relief to its 24-sheet limit, which can change the applied exaggeration. The pictured project uses 24 layers.</li>
    <li>In <strong>Map details</strong>, keep <strong>Water depth</strong> on, set <strong>Depth exaggeration</strong> to 1.75× and turn on <strong>Fit lake depth to available layers</strong>. Choose roads, water and other details, then select <strong>Generate terrain</strong>.</li>
    <li>Inspect the layers and the exploded 3D view, then open <strong>Export</strong>, download the complete project and read its assembly guide.</li>
  </ol>
  <p>Your result can differ from the picture. Choosing the preset centers the map on Crater Lake but does not reproduce the pictured map area, and it does not reset a saved project's other settings. Check the output type, size, material thickness and map details explicitly. Different framing, fresh data or different settings change the layer and panel counts.</p>
  <h2>Understand the lake</h2>
  <p>The surrounding terrain uses real elevation data. With water depth on, Crater Lake uses the integrated USGS lake-floor survey where available; uncovered areas use existing terrain or modeled depths. The <a href={`${base}/guides/lake-depth-data`}>lake depth directory</a> lists every integrated survey.</p>
  <p>Because fitting is on, the studio shows <strong>Lake depth fitting is on</strong> and how much of the requested depth was applied. Select <strong>Use manual depth</strong> to turn fitting off; if the lake is then too deep for the stack, its deepest floor is flattened and a warning offers <strong>Fit depth</strong> to turn it back on. <a href={`${base}/guides/how-lake-depths-work#layers`}>Learn how depth settings affect layers</a>.</p>
  <h2>Try the same place as an engraving</h2>
  <p>Switch to <strong>Flat</strong> for a single surface. Adjust contour density and index lines, choose the details you want, then generate and inspect the flat preview. Follow the <a href={`${base}/guides/topographic-map-engraving`}>engraving guide</a> for the SVG output and import checks.</p>
  <h2>Next steps</h2>
  <p>Download the project-settings JSON as a record of your chosen area and controls, and keep <strong>ATTRIBUTION.txt</strong> and the README with the artwork. Follow the <a href={`${base}/guides/laser-cut-topographic-map`}>layered map guide</a> to import, cut and assemble the pieces.</p>
</Article>
