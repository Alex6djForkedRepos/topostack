<script lang="ts">
  import { base } from "$app/paths";
  import Article from "../../../lib/Article.svelte";
</script>

<Article title="Explore a Crater Lake topographic map" intro="Start with the landscape already waiting in TopoStack. The Crater Lake preview shows how real elevation and map details become a layered terrain project.">
  <figure>
    <img src={`${base}/images/studio-crater-lake.png`} width="1280" height="900" alt="Freshly generated Crater Lake relief in TopoStack with USGS surveyed lake-floor bathymetry." />
    <figcaption>Freshly generated Crater Lake relief with USGS surveyed lake-floor data where available. Gaps use existing terrain or modeled depths; depth is exaggerated.</figcaption>
  </figure>
  <h2>Recreate the pictured project</h2>
  <ol>
    <li><a href={`${base}/studio`}>Open the terrain studio</a>. A new browser starts with the Crater Lake preview. If a saved project opens instead, choose the <strong>Crater Lake</strong> location preset.</li>
    <li>Select <strong>Layered relief</strong>. For a starting size like the pictured project, choose a rectangle, 406.4 mm wide by 270.933 mm high, with 3.175 mm sheet material.</li>
    <li>Inspect the selected map area and request 4× terrain exaggeration. The studio fits the relief to its layer limit, which can reduce the applied scale. The pictured project uses 24 layers; different framing or data updates can change the result.</li>
    <li>Enable <strong>Water depth</strong>, set depth exaggeration to <strong>1.75×</strong>, and enable <strong>Fit lake depth to available layers</strong>. Choose roads, water and other details, then select <strong>Generate terrain</strong>.</li>
    <li>Inspect the layers and the exploded 3D view, then export the complete project and read its assembly guide.</li>
  </ol>
  <p>Choosing the location preset changes the place; it does not reset all of a saved project's other settings. Check output mode, size, material thickness and map details explicitly.</p>
  <h2>Understand the lake</h2>
  <p>The surrounding terrain uses real elevation data. With water depth enabled, Crater Lake uses the integrated USGS lake-floor survey where available; uncovered areas use existing terrain or modeled depths. The <a href={`${base}/guides/lake-depth-data`}>searchable lake depth directory</a> lists the full integrated survey coverage. Use <strong>Fit depth</strong> if the lake is deeper than the stack can hold.</p>
  <p>Look for warnings about missing requested data, omitted labels or terrain that needs regeneration. Fresh data, a different crop or different fabrication settings can change the resulting layer and panel counts.</p>
  <h2>Try the same place as an engraving</h2>
  <p>Switch to <strong>Flat engraving</strong> for a single surface. Adjust contour density and index lines, choose the details you want, then generate and inspect the flat preview. Follow the <a href={`${base}/guides/topographic-map-engraving`}>engraving guide</a> for the SVG output and import checks.</p>
  <h2>Keep your settings with the result</h2>
  <p>Download the project-settings JSON as a reproducible record of your chosen area and controls. Keep the source attribution and fabrication README with the artwork. For layered output, follow the <a href={`${base}/guides/laser-cut-topographic-map`}>layered map guide</a> when importing and assembling the pieces.</p>
</Article>
