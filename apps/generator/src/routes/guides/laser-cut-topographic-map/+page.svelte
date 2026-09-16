<script lang="ts">
  import { base } from "$app/paths";
  import Article from "../../../lib/Article.svelte";
</script>

<Article title="How to make a laser-cut topographic map" intro="Turn a mountain, lake or familiar landscape into a layered relief. TopoStack converts real elevation data into SVG cut panels, engraving companions and an assembly guide.">
  <h2>What you need</h2>
  <p>A browser with an internet connection, sheet material of a known thickness, and laser software that can import SVG files. TopoStack is free to use and needs no account. It prepares artwork; you choose the machine settings for your material.</p>
  <h2>1. Choose and frame your landscape</h2>
  <p><a href={`${base}/studio`}>Open the terrain studio</a> and select <strong>Layered relief</strong>. Choose a place by search, coordinates or a location preset. Use the map to frame the area. Start with a recognizable feature rather than a very large region so its contours remain readable at the final size.</p>
  <p>The initial Crater Lake model is a bundled preview. You can explore it immediately, but you must generate fresh terrain before exporting fabrication artwork.</p>
  <h2>2. Set the physical size and material thickness</h2>
  <p>Open <strong>Cut size</strong> and choose a rectangle or circle. Enter the finished dimensions, then open <strong>Terrain layers</strong> and enter your measured sheet thickness. Millimeter dimensions carry through to the SVG files.</p>
  <p>Layer count is calculated from the landscape's elevation range, map scale, vertical exaggeration and material thickness. Adjust the exaggeration to change the relief. A thicker sheet generally needs fewer layers for the same model height. Read the resulting count in the studio; it is not a separate layer-count setting.</p>
  <h2>3. Choose the map details</h2>
  <p>Add roads, trails, water, labels, a compass or a scale bar as useful context. Preview the fine details at the size you intend to make. Features that look attractive on screen may be too small for your material or laser.</p>
  <p>Search the <a href={`${base}/guides/lake-depth-data`}>lake depth directory</a> for lakes with surveyed grids or depth contours. Elsewhere, TopoStack can model depths using lake data and distance from shore. Check the source notes for your chosen area; source credits are included with your export.</p>
  <h2>4. Generate and inspect</h2>
  <p>Select <strong>Generate terrain</strong>. Inspect the cut layers and the stacked or exploded 3D preview. Resolve export-blocking messages about stale settings or missing data. The preview identifies warnings such as labels that could not fit safely.</p>
  <h2>5. Export and import the artwork</h2>
  <p>Open <strong>Export</strong> and download the complete project. Layered output includes a master SVG, cut panels, matching engraving panels and an assembly guide. SVG operation groups separate red cuts, blue scores and black engravings.</p>
  <p>In your laser software, confirm the imported dimensions and assign the operations deliberately. Color alone does not configure the machine. If you use TopoStack's kerf compensation, avoid applying the same correction again in the receiving software.</p>
  <h2>6. Keep the pieces and follow the assembly guide</h2>
  <p>Material-saving nesting can place a smaller layer inside a lower layer's unused area. Keep every loose cutout and use the layer IDs and assembly guide to identify where it belongs. Alignment engravings help position the next layer and remain covered by it.</p>
  <p class="note">Generate and export the project before committing material. Review the paths and test your chosen material and machine settings on a small sample.</p>
  <h2>Want a single engraved surface?</h2>
  <p>Use the <a href={`${base}/guides/topographic-map-engraving`}>flat topographic engraving workflow</a> to export one SVG containing engraving paths. For a starting landscape, follow the <a href={`${base}/examples/crater-lake`}>Crater Lake example</a>.</p>
</Article>
