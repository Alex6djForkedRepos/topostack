<script lang="ts">
  import { base } from "$app/paths";
  import Article from "$lib/site/Article.svelte";

  const origin = "https://topostack.app";
  const rainier = { requestVersion: 1, area: { center: { lat: 46.8523, lon: -121.7603 }, widthKm: 20 }, placeLabel: "Mount Rainier, Washington", materialThicknessMm: 3 };
  const curl = `curl -X POST ${origin}/v1/projects/plan \\\n  -H 'content-type: application/json' \\\n  -d '${JSON.stringify(rainier)}'`;
  const fetchExample = `const request = ${JSON.stringify(rainier, null, 2)};

const response = await fetch("${origin}/v1/projects/plan", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(request),
});
const result = await response.json();
if (!response.ok) {
  const fields = (result.errors ?? []).map((issue) => \`\${issue.path}: \${issue.message}\`);
  throw new Error([result.error, ...fields].join("\\n"));
}
console.log(result.plan.sheetCount, result.studioUrl);`;
  const planResponse = `{
  "project": {
    "name": "Mount Rainier", "output": "layered", "widthMm": 300, "heightMm": 200,
    "materialThicknessMm": 3, "bounds": { … }, …
  },
  "plan": {
    "output": "layered", "sheetCount": 35, "heightOfModelMm": 105,
    "fittedVerticalExaggeration": 2, "metersPerStep": 104,
    "scaleDenominator": 66667, "groundWidthKm": 20, "groundHeightKm": 13.3,
    "minElevationM": 750, "maxElevationM": 4390, "reliefM": 3640,
    "estimate": true, …
  },
  "relief": { "sampleZoom": 10, "tiles": 2, "coastal": false },
  "coverage": { "terrain": { … }, "lakeSurveys": [], … },
  "notes": ["Estimated from terrain sampled at zoom 10; …"],
  "studioUrl": "${origin}/studio?generate=1#p=1.…",
  "attribution": {
    "text": "Terrain: Mapzen Terrain Tiles and its sources · Map data © OpenStreetMap contributors (ODbL) · …",
    "sources": [ … ],
    "fullNotice": "${origin}/attribution"
  }
}`;
  const bounds = JSON.stringify({ requestVersion: 1, area: { bounds: { west: -120.15, south: 38.9, east: -119.9, north: 39.27 } }, placeLabel: "Lake Tahoe", output: "flat", widthMm: 200, heightMm: 300, title: "Lake Tahoe" }, null, 2);
  const invalid = `{
  "error": "The project request is invalid.",
  "errors": [
    { "path": "area.center.lon", "message": "Must be between -180 and 180." },
    { "path": "output", "message": "Must be one of: layered, flat." }
  ]
}`;
</script>

<Article title="Plan terrain models with the HTTP API" intro="Describe a place and a model in JSON, get a sheet count and scale estimated from real terrain, and receive a studio link that opens and builds the model. No account or key is needed.">
  <p>The API is for scripts, apps and assistants that want to prepare a model for someone to cut. It checks the request, estimates the result from a coarse sample of the terrain, and returns a link to the studio. Opening that link generates the model in the browser, where the SVG files are reviewed and exported. Nothing is generated or stored on a server. If you are connecting a chat assistant instead, the <a href={`${base}/guides/mcp-server`}>MCP server</a> offers the same operations as tools.</p>

  <h2>Quick start</h2>
  <p>Plan a 300 × 200 mm layered model of Mount Rainier in 3 mm sheets:</p>
  <pre><code>{curl}</code></pre>
  <p>Or from JavaScript, in a browser or on a server:</p>
  <pre><code>{fetchExample}</code></pre>
  <p>The response describes the model and links to it (abridged; the numbers are illustrative):</p>
  <pre><code>{planResponse}</code></pre>
  <p>Give <code>studioUrl</code> to the person making the model. The studio opens with the design loaded and generates it straight away; they check it, adjust roads, labels and anything else, and export. The full description of every route is the OpenAPI 3.1 document at <a href={`${origin}/v1/openapi.json`}><code>{origin}/v1/openapi.json</code></a>.</p>

  <h2 id="describe-the-model">Describe the model</h2>
  <p>Every route takes the same request. Only <code>requestVersion</code> and <code>area</code> are required; everything else falls back to the studio's defaults.</p>
  <table class="fields">
    <thead><tr><th scope="col">Field</th><th scope="col">Values</th><th scope="col">Default</th></tr></thead>
    <tbody>
      <tr><td><code>requestVersion</code></td><td><code>1</code></td><td>Required</td></tr>
      <tr><td><code>area</code></td><td>A point and ground width, or a bounding box (below)</td><td>Required</td></tr>
      <tr><td><code>placeLabel</code></td><td>Text, up to 240 characters</td><td>Custom coordinates</td></tr>
      <tr><td><code>name</code></td><td>Text, up to 120 characters; names the exported files</td><td>The label up to its first comma</td></tr>
      <tr><td><code>widthMm</code>, <code>heightMm</code></td><td>20–10,000 mm</td><td>300 × 200 mm</td></tr>
      <tr><td><code>shape</code></td><td><code>rectangle</code>, <code>circle</code> (the width is the diameter)</td><td><code>rectangle</code></td></tr>
      <tr><td><code>output</code></td><td><code>layered</code> for a stack of cut sheets, <code>flat</code> for one engraved contour map</td><td><code>layered</code></td></tr>
      <tr><td><code>materialThicknessMm</code></td><td>0.5–25 mm</td><td>3 mm</td></tr>
      <tr><td><code>verticalExaggeration</code></td><td>1–10</td><td>2</td></tr>
      <tr><td><code>contourCount</code></td><td>4–40 lines; flat output</td><td>12</td></tr>
      <tr><td><code>units</code></td><td><code>metric</code>, <code>imperial</code>; how the studio shows lengths</td><td><code>metric</code></td></tr>
      <tr><td><code>details</code></td><td>On or off: <code>water</code>, <code>waterDepth</code>, <code>roads</code>, <code>trails</code>, <code>roadLabels</code>, <code>boundaries</code>, <code>coordinateGrid</code>, <code>elevationLabels</code>, <code>northArrow</code>, <code>scaleBar</code></td><td>Road labels, boundaries and the grid off; the rest on</td></tr>
      <tr><td><code>title</code></td><td>Up to 3 lines of 40 characters, separated by <code>\n</code>; engraved on the map</td><td>None</td></tr>
      <tr><td><code>laser</code></td><td><code>kerfMm</code> 0–1; <code>workAreaWidthMm</code> and <code>workAreaHeightMm</code> for the laser bed, 0 for unlimited</td><td>0.15 mm kerf, unlimited bed</td></tr>
      <tr><td><code>markers</code></td><td>Up to 20 of <code>{"{ lat, lon, symbol, name }"}</code>; symbols <code>pin</code>, <code>circle</code>, <code>triangle</code>, <code>star</code>, <code>cross</code></td><td>None</td></tr>
    </tbody>
  </table>
  <p>The same ranges apply as in the studio; see the <a href={`${base}/guides/settings-reference`}>settings reference</a> for what each one does. Unknown fields are rejected rather than ignored, so a typo is reported instead of silently falling back to a default.</p>

  <h3>Choosing the area</h3>
  <p>An area is either a point with how much ground to show from west to east, <code>{"{ \"center\": { \"lat\": 46.85, \"lon\": -121.76 }, \"widthKm\": 20 }"}</code> (0.1–2,000 km), or a box to keep whole, <code>{"{ \"bounds\": { \"west\": …, \"south\": …, \"east\": …, \"north\": … } }"}</code>. Either way the crop is widened to the model's proportions: a box is always entirely visible, with extra ground on two sides when its shape differs from the model's. Latitudes run to ±85.05°, and areas cannot cross the 180° meridian. For example, a flat, portrait engraving of Lake Tahoe with a title:</p>
  <pre><code>{bounds}</code></pre>
  <p class="note">An area wider than about 100 km makes a very gentle model at typical sizes, and one narrower than a kilometre shows only a few terrain samples. Plan a couple of variations before settling on one.</p>

  <h2>Routes</h2>
  <table>
    <thead><tr><th scope="col">Route</th><th scope="col">Returns</th></tr></thead>
    <tbody>
      <tr><td><code>POST /v1/projects/plan</code></td><td>The estimate: sheet count, stack height, fitted exaggeration, scale, ground size and elevation range (or the contour interval for flat output), with notes, data coverage, a studio link and attribution.</td></tr>
      <tr><td><code>POST /v1/projects/link</code></td><td>Just the studio link: <code>{"{ url, length }"}</code>. Also accepts <code>{"{ \"project\": … }"}</code> with the <code>project</code> of a saved TopoStack project file.</td></tr>
      <tr><td><code>POST /v1/projects/resolve</code></td><td>The full project the request expands to, as a project file stores it, with its studio link and attribution.</td></tr>
      <tr><td><code>GET /v1/coverage</code></td><td>Which high-resolution terrain and surveyed lake floors reach an area, for <code>?bbox=west,south,east,north</code> or <code>?lat=&amp;lon=&amp;widthKm=</code>.</td></tr>
      <tr><td><code>GET /v1/geocode</code></td><td>Place search: <code>?q=</code> (2–160 characters) and <code>&amp;limit=</code> (1–8), returning names and coordinates.</td></tr>
      <tr><td><code>GET /v1/openapi.json</code></td><td>The OpenAPI document with every request and response schema.</td></tr>
    </tbody>
  </table>

  <h3>Reading a plan</h3>
  <ul>
    <li><code>sheetCount</code> is an estimate from terrain sampled at a low zoom, which can smooth sharp peaks. The studio's count after generating is the one that is cut; in testing they agree within a sheet or two. Flat output is always one sheet.</li>
    <li><code>fittedVerticalExaggeration</code> can differ slightly from the one requested, because the stack is rounded to whole sheets.</li>
    <li><code>metersPerStep</code> is the elevation each sheet adds, or the interval between engraved contours.</li>
    <li><code>scaleDenominator</code> is the scale across the model's width: 66,667 means 1:66,667.</li>
    <li><code>notes</code> are plain sentences worth showing: nearly flat ground, very tall stacks, coastlines (the sea is cut flat), lake depth that adds sheets below the shoreline, and models larger than the laser bed, which are split into pieces with alignment tabs.</li>
  </ul>
  <p>Plan as often as you like while tuning thickness, size, exaggeration or area, and only share the link once the plan looks right.</p>

  <h3>Studio links</h3>
  <p>A studio link looks like <code>{origin}/studio?generate=1#p=1.…</code>. The whole design is compressed into the part after <code>#</code>, which browsers never send to a server, so the link works on its own and nothing is stored. Opening it replaces the design in the studio, and <strong>Undo</strong> brings the previous one back. A link can be up to 8,000 characters; a design too large for that, usually one with long imported routes, is refused with a <code>413</code>, and should be shared as a project file instead.</p>

  <h2>Errors</h2>
  <p>Errors are JSON with a message, and a list of every invalid field when the request itself is wrong:</p>
  <pre><code>{invalid}</code></pre>
  <table>
    <thead><tr><th scope="col">Status</th><th scope="col">Meaning</th></tr></thead>
    <tbody>
      <tr><td>400</td><td>The body is not valid JSON, or a coverage or search query is missing or malformed.</td></tr>
      <tr><td>405</td><td>Wrong method: the <code>/v1/projects</code> routes take <code>POST</code>, the others <code>GET</code>.</td></tr>
      <tr><td>413</td><td>The body is over 128,000 bytes, or the design does not fit in a studio link.</td></tr>
      <tr><td>415</td><td>The body is not sent with <code>content-type: application/json</code>.</td></tr>
      <tr><td>422</td><td>The request is invalid; <code>errors</code> names each field by its path.</td></tr>
      <tr><td>429</td><td>Too many requests. Wait for the <code>retry-after</code> seconds (60) before trying again.</td></tr>
      <tr><td>502, 503, 504</td><td>Terrain or place search is unavailable for the moment. Try again shortly.</td></tr>
    </tbody>
  </table>

  <h2>Limits and good manners</h2>
  <ul>
    <li>Requests are anonymous. The planning routes allow 120 requests a minute from one address, with a shared ceiling across everyone; place search allows 30 lookups a minute that are not already cached.</li>
    <li>Every route answers any web origin (<code>Access-Control-Allow-Origin: *</code>), so browser apps can call it directly. No cookies or credentials are used.</li>
    <li>Coverage and the OpenAPI document may be cached for an hour, and search results for a day.</li>
    <li>Plans are decorative estimates, not survey data. Ask the maker to check the area and size in the studio and cut one layer as a test.</li>
  </ul>

  <h2>Credit the data</h2>
  <p>Every response that uses map data includes an <code>attribution</code> object. Keep its <code>text</code> with anything you show or pass on from the response, and link to <code>fullNotice</code> where there is room. The exported files carry their own credits. Sources and licenses are listed on the <a href={`${base}/attribution`}>attribution page</a>, and what TopoStack receives from API callers is described in the <a href={`${base}/privacy`}>privacy notice</a>.</p>
</Article>

<style>
  /* On phones each row becomes a block, as on the settings reference, so long field and tool names stay whole. */
  @media (max-width: 700px) {
    table, tbody, tr, td { display: block; }
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
    tr { padding-block: 10px; border-bottom: 1px solid var(--loidolt-border); }
    td { padding: 2px 0; border: 0; }
    td:first-child { font-weight: 600; }
    .fields td:nth-child(3)::before { content: "Default: "; color: var(--loidolt-text-muted); }
  }
</style>
