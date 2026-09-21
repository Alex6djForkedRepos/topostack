<script lang="ts">
  import { base } from "$app/paths";
  import Article from "$lib/site/Article.svelte";
</script>

<Article title="Map details, labels and linework" intro="Choose which roads, water and annotations appear on your map, place the north arrow and labels, and set line widths that suit your laser and material.">
  <h2>What you need</h2>
  <p>A project with a place and size chosen. Map details and linework update the preview without regenerating terrain, so you can experiment freely. Judge every change at your finished size: a detail that reads well on screen can be too fine to engrave.</p>

  <h2>1. Choose map features</h2>
  <p>In <strong>Map details</strong>, <strong>Terrain features</strong> turns on data from OpenStreetMap:</p>
  <ul>
    <li><strong>Roads</strong> and <strong>Trails</strong> (on by default).</li>
    <li><strong>Transportation labels</strong>: road and trail names, where they fit.</li>
    <li><strong>Water outlines</strong> (on by default): lake, river and coast lines. In flat output, <strong>Water fill</strong> adds Lines, Ripples or Dots inside water; None keeps outlines only.</li>
    <li><strong>State / province boundaries</strong>, drawn dashed.</li>
    <li><strong>Latitude / longitude grid</strong>, drawn dotted.</li>
    <li><strong>Engraved border</strong> (flat only, on by default): an outline around the artwork.</li>
  </ul>
  <p>Layered output adds <strong>Water depth</strong> (see <a href={`${base}/guides/how-lake-depths-work`}>how lake depths work</a>) and, under <strong>Assembly</strong>, <strong>Assembly guides</strong>: engraved outlines and layer numbers that show where each sheet sits.</p>
  <p class="note">Dense areas can reach the map detail limit, which leaves some features out or blocks export. Frame a smaller area or turn off details you do not need.</p>

  <h2>2. Add annotations</h2>
  <p>Under <strong>Annotations</strong>:</p>
  <ul>
    <li><strong>Elevation labels</strong> (on by default) engrave elevations on the terrain. <strong>Label X</strong> and <strong>Label Y</strong> set a preferred position as a percentage from the center (−90 to 90); TopoStack moves labels where needed to avoid other lines, and leaves out any that cannot fit.</li>
    <li><strong>North arrow</strong> (on by default) offers three designs, <strong>Minimal</strong>, <strong>Classic</strong> and <strong>Mariner</strong>, and a <strong>Diameter</strong> from 12 mm up to a limit set by your artwork size. Choose one of nine <strong>Placement</strong> positions, then nudge it with <strong>Offset X</strong> and <strong>Offset Y</strong> (−100 to 100%). <strong>Reset offset</strong> recenters it.</li>
    <li><strong>Scale bar</strong> (on by default).</li>
    <li><strong>Title</strong> (off by default) engraves up to three lines of text, such as a place name, a date and a route, in capitals. It starts from the project name; <strong>Use project name</strong> restores it. Set the <strong>Letter height</strong> (3–30 mm) and one of nine <strong>Placement</strong> positions; lines align toward the chosen edge. Contours and map details under the text are cleared so it stays readable. The stroke font covers letters, digits and common punctuation (<code>, . ' - / : &amp; # ( ) ! °</code>); a note lists any other character, which would engrave as “?”. A title that does not fit the material is left out with a warning.</li>
  </ul>

  <h2>3. Set the text style</h2>
  <p>Under <strong>Text engraving</strong>, choose a single-line font, <strong>Technical</strong>, <strong>Rounded</strong> or <strong>Stencil</strong>, and a <strong>Text size</strong> from 2 to 10 mm. Text size is the height of capital letters. Larger text is easier to engrave but has fewer places to fit.</p>

  <h2>4. Tune the linework</h2>
  <p>In <strong>Linework</strong>, start from a preset:</p>
  <ul>
    <li><strong>Fine</strong>: thinner lines and dotted trails, for dense detail or large pieces.</li>
    <li><strong>Balanced</strong> (default): a clear hierarchy with dashed trails.</li>
    <li><strong>Bold</strong>: thicker lines for strong contrast or small pieces.</li>
  </ul>
  <p>Open <strong>Customize preset</strong> to adjust individual widths, each from 0.05 to 1.5 mm:</p>
  <ul>
    <li><strong>Topography</strong> (flat only): <strong>Minor contours</strong> and <strong>Index contours</strong>.</li>
    <li><strong>Map features</strong>: <strong>Major roads</strong>, <strong>Local roads</strong>, <strong>Trails</strong>, <strong>Water</strong>, <strong>Boundaries</strong> and <strong>Lat / long grid</strong>.</li>
    <li><strong>Road appearance</strong>: <strong>Centerline</strong>, or <strong>Outlined</strong> major roads drawn as two parallel lines with an <strong>Outline spacing</strong> of 0.2–4 mm; <strong>Round</strong> or <strong>Square</strong> road ends.</li>
    <li><strong>Trail pattern</strong>: <strong>Solid</strong>, <strong>Dashed</strong> or <strong>Dotted</strong>.</li>
    <li><strong>Finishing</strong>: <strong>Labels &amp; guides</strong>, and <strong>Border</strong> in flat output.</li>
  </ul>
  <p>Widths are physical stroke widths in the SVG. The width your laser actually burns also depends on focus, power, speed, material, and whether your software engraves strokes as lines or as filled shapes.</p>

  <h2>Check before you engrave</h2>
  <p class="note">Zoom into the Cut layers or Engraving preview at your finished size. Look for labels crowding contours, fills competing with the terrain, and lines too close to separate on your material. Test your narrowest line width on scrap.</p>

  <h2>Next steps</h2>
  <p>Add your own points and routes with <a href={`${base}/guides/custom-markers-and-paths`}>custom markers and paths</a>, or look up any control in the <a href={`${base}/guides/settings-reference`}>settings reference</a>.</p>
</Article>
