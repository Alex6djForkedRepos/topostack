<script lang="ts">
  import { base } from "$app/paths";
  import Article from "../../../lib/Article.svelte";
</script>

<Article title="Explore a Crater Lake topographic map" intro="Start with the landscape already waiting in TopoStack. The Crater Lake preview shows how real elevation and map details become a layered terrain project.">
  <figure>
    <img src={`${base}/images/studio-crater-lake.png`} width="1280" height="900" alt="Crater Lake's bundled terrain preview in TopoStack, shown as an exploded 3D stack with project and layer controls." />
    <figcaption>A screenshot of the bundled preview, not a photograph of a fabricated object. Generate fresh terrain before exporting your own artwork.</figcaption>
  </figure>
  <h2>Recreate the starting project</h2>
  <ol>
    <li><a href={`${base}/studio`}>Open the terrain studio</a>. A new browser starts with the Crater Lake preview. If a saved project opens instead, choose the <strong>Crater Lake</strong> location preset.</li>
    <li>Select <strong>Layered relief</strong>. For a starting size like the pictured project, choose a rectangle, 300 mm wide by 200 mm high, with 3 mm sheet material.</li>
    <li>Inspect the selected map area and set the vertical exaggeration to suit the relief you want. The studio calculates the layer count; the pictured count is a preview result, not a guaranteed result for every framing or data update.</li>
    <li>Choose roads, water and other details, then select <strong>Generate terrain</strong>.</li>
    <li>Inspect the layers and the exploded 3D view, then export the complete project and read its assembly guide.</li>
  </ol>
  <p>Choosing the location preset changes the place; it does not reset all of a saved project's other settings. Check output mode, size, material thickness and map details explicitly.</p>
  <h2>Understand the lake</h2>
  <p>The surrounding terrain uses real elevation data. Where water depth is enabled and lake data is available, the basin is modeled using HydroLAKES and GLOBathy. The underwater shape is decorative and should not be interpreted as a survey.</p>
  <p>Look for warnings about missing requested data, omitted labels or terrain that needs regeneration. Fresh data, a different crop or different fabrication settings can change the resulting layer and panel counts.</p>
  <h2>Try the same place as an engraving</h2>
  <p>Switch to <strong>Flat engraving</strong> for a single surface. Adjust contour density and index lines, choose the details you want, then generate and inspect the flat preview. Follow the <a href={`${base}/guides/topographic-map-engraving`}>engraving guide</a> for the SVG output and import checks.</p>
  <h2>Keep your settings with the result</h2>
  <p>Download the project-settings JSON as a reproducible record of your chosen area and controls. Keep the source attribution and fabrication README with the artwork. For layered output, follow the <a href={`${base}/guides/laser-cut-topographic-map`}>layered map guide</a> when importing and assembling the pieces.</p>
</Article>
