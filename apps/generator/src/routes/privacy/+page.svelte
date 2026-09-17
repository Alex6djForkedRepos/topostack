<script lang="ts">
  import Article from "../../lib/Article.svelte";
</script>

<Article title="Privacy and browser storage" intro="TopoStack stores project settings in your browser and requests the map data needed to create your artwork. No account is required.">
  <h2>Your projects</h2>
  <p>Project settings are stored in this browser's IndexedDB. Theme and interface preferences are stored locally too. Project names, custom markers and project settings are not included in usage events. Export a settings backup before clearing browser storage. Downloaded files remain wherever you choose to save them.</p>
  <h2>Map and platform services</h2>
  <p>Place searches are sent through the TopoStack map API to Geoapify. Search responses are cached under a hashed query key for 24 hours. Terrain and map requests reveal the tiles or areas needed to generate the project. Elevation uses Mapzen tiles, map features use Protomaps/OpenStreetMap data, and the reference map loads OpenFreeMap tiles. Those services receive ordinary connection information when your browser or the API contacts them.</p>
  <p>In Atomm, its SDK supports exporting artwork to the platform. TopoStack does not read or store an Atomm user profile or token. Files you hand to Atomm are processed by that platform.</p>
  <h2>Visits and successful use</h2>
  <p>The production website uses Cloudflare Web Analytics and a small first-party usage endpoint to understand whether visitors open the studio, generate usable real terrain and prepare fabrication exports. Usage events contain fixed categories: the public landing page, acquisition source, device size, output type and outcome. They do not contain project names, coordinates, search text, custom map data or a persistent user identifier.</p>
  <p>The acquisition category is retained in this tab's session storage so it follows navigation into the studio. It expires after 30 minutes of inactivity and is removed when the tab session ends. Usage collection is best effort; blocked requests do not affect generation or export. TopoStack's own usage events honor Do Not Track and Global Privacy Control.</p>
  <p>Cloudflare hosts the site and API. Its operational logs may contain request metadata such as IP addresses and requested URLs, including data needed for rate limiting and troubleshooting. The restricted usage-event fields do not change what hosting or map providers need to process requests.</p>
  <h2>Feedback</h2>
  <p>Feedback drafts stay in memory in the current page until you open GitHub or copy them. Optional diagnostic context includes coordinates, settings and data sources, and can be reviewed before sharing. Project names and custom markers are excluded. Continuing sends the report to GitHub in a prefilled link; you must sign in and submit it there. Submitted issues are public. Do not include private information.</p>
  <h2>External links</h2>
  <p>GitHub, PayPal, Atomm and the linked data providers apply their own privacy terms when you use them. Questions about TopoStack can be raised through the <a href="https://github.com/Echo-Foxtrot-Works/topostack/issues">project's issue tracker</a>; avoid posting private project information in a public issue.</p>
</Article>
