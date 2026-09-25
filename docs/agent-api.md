# Agent API reference

TopoStack is open to AI assistants and scripts through several surfaces:

- REST routes and a remote MCP server on the `map-api` Worker, both backed by one set of functions;
- an MCP App that previews a model inside the chat;
- WebMCP tools inside the studio.

This page is the maintainers' reference: what those surfaces accept and return today, and where each behaviour lives in the code. The design, the phase plan, and the measured accuracy of plans are in [plans/agent-api.md](plans/agent-api.md).

The public guides are written for people building on the API rather than maintaining it. When a change here alters what callers see, update the matching guide in the same pull request:

- [HTTP API](https://topostack.app/guides/http-api) (`apps/generator/src/routes/guides/http-api/`)
- [MCP server](https://topostack.app/guides/mcp-server) (`apps/generator/src/routes/guides/mcp-server/`)
- [Use TopoStack with AI assistants](https://topostack.app/guides/use-with-ai-assistants), for makers connecting a chat app

None of these surfaces generates geometry on a server. They validate a request, estimate the stack from a coarse terrain sample, and return a studio link. Opening the link generates the model in the browser, where the files are exported ([architecture.md § Agent surfaces](architecture.md#agent-surfaces)).

## Surfaces at a glance

| Surface | Where | Transport | Code |
| --- | --- | --- | --- |
| REST | `/v1/projects/{resolve,plan,link}`, `/v1/coverage`, `/v1/geocode` | JSON over HTTPS; described at `/v1/openapi.json` | `workers/map-api/src/agent/` |
| Remote MCP | `/mcp` | Streamable HTTP, stateless, JSON replies only | `workers/map-api/src/mcp/` |
| MCP server card | `/.well-known/mcp/server-card.json` | JSON | `workers/map-api/src/mcp/server.ts` |
| In-chat preview (MCP App) | resource `ui://topostack/terrain-preview.html` | HTML in the chat host's iframe, `postMessage` bridge | `apps/generator/src/mcp-app/` |
| WebMCP | `navigator.modelContext` in `/studio` | in-page tool calls | `apps/generator/src/lib/studio/webmcp*.ts` |
| Request contract | `ProjectRequestV1` and its JSON Schema | shared by all of the above | `packages/core/src/project/` |
| Studio link codec | `#p=1.…` | URL fragment | `packages/data-contracts/src/share-link.ts` |

Production is at `https://topostack.app`; development is at `https://dev.topostack.app`. The API and the site share a host in both environments.

**Two origins.** Code chooses between two origins, and they differ only in local development:

- Studio links and the attribution `fullNotice` use `PUBLIC_ORIGIN`, the studio. `npm run dev` sets it to `http://localhost:5273`.
- The OpenAPI `servers` entry, the server card's `remotes`, and the preview's CSP use the origin of the request, which is the Worker (`http://localhost:8787` locally).

## The request: `ProjectRequestV1`

Every surface takes the same request. It is a short description that is expanded onto the studio's defaults (`DEFAULT_PROJECT`) and then checked by `parseProject`, the same parser that reads an imported project file. The type, the limits, and the parser are in `packages/core/src/project/request.ts`. The JSON Schema is in `schema.ts` next to it, and a test checks that Ajv and the parser agree.

```json
{
  "requestVersion": 1,
  "area": { "center": { "lat": 46.8523, "lon": -121.7603 }, "widthKm": 20 },
  "placeLabel": "Mount Rainier, Washington",
  "materialThicknessMm": 3
}
```

| Field | Type | Default | Limits |
| --- | --- | --- | --- |
| `requestVersion` | `1` | required on REST; MCP tools assume 1 | must be `1` |
| `area` | `{ center: { lat, lon }, widthKm }` or `{ bounds: { west, south, east, north } }` | required | lat ±85.0511, lon ±180, `widthKm` 0.1–2,000; west < east (no antimeridian crossing), south < north |
| `placeLabel` | string | `"Custom coordinates"` | 240 characters |
| `name` | string | text before the first comma of `placeLabel`, else `"Terrain model"` | 120 characters |
| `widthMm`, `heightMm` | number | 300, 200 | 20–10,000 |
| `shape` | `"rectangle"` \| `"circle"` | `"rectangle"` | |
| `units` | `"metric"` \| `"imperial"` | `"metric"` | |
| `output` | `"layered"` \| `"flat"` | `"layered"` | `flat` becomes `outputMode: "engraving"` |
| `materialThicknessMm` | number | 3 | 0.5–25 |
| `verticalExaggeration` | number | 2 | 1–10 |
| `contourCount` | integer | 12 | 4–40; flat output only |
| `details` | object of booleans | on: `water`, `waterDepth`, `roads`, `trails`, `elevationLabels`, `northArrow`, `scaleBar`; off: `roadLabels`, `boundaries`, `coordinateGrid` | only those ten keys |
| `title` | string, lines separated by `\n` | none; `""` removes it | 3 lines of 40 characters |
| `laser.kerfMm` | number | 0.15 | 0–1 |
| `laser.workAreaWidthMm`, `laser.workAreaHeightMm` | number | 0 (no bed limit) | 0, or 20–10,000 |
| `markers[]` | `{ lat, lon, symbol?, name? }` | none | at most 20; `symbol` is one of `pin`, `circle`, `triangle`, `star`, `cross` (default `pin`); `name` 60 characters |

The limits are exported as `PROJECT_REQUEST_LIMITS`, and the parser and schema both read them.

### How a request becomes a project

- **Area.** An area is fitted to the model's proportions (`bounds.ts`):
  - `center` + `widthKm` gives `widthKm` of ground from west to east, centred on the point (`boundsAround`).
  - `bounds` gives the smallest box with the model's aspect ratio that contains the one requested (`coverBounds`). The requested box is always wholly visible.
  - If the fitted crop leaves the Web Mercator world, the request fails with a root-level error (path `""`).
- **Location.** `location.zoom` comes from the crop and is clamped to 3–14. For a `bounds` area, `location.lat` and `location.lon` are the midpoint of the box.
- **Title.** `title` turns on the plaque: 6 mm text, anchored bottom-left.
- **Markers.** Markers get ids `marker-1`, `marker-2`, … and a size of 8 mm.
- **Project id.** The id is `agent-` followed by an FNV-1a hash of the request. The same request always expands to the same project and the same link.

`describeProject` goes the other way and turns a project back into a request. It always returns `bounds`, and it drops custom-symbol markers. WebMCP uses it.

### Validation

The parser collects every problem at once as `{ path, message }`:

- Paths use dots and indexes, for example `area.center.lon`, `details.roads`, `markers[3].name`.
- Problems with the request as a whole have the path `""`.
- Unknown keys at any level are errors (`"Unknown field."`); the schema sets `additionalProperties: false` everywhere.

The messages are short and fixed:

- `Must be a number.`
- `Must be a whole number.`
- `Must be between 0.5 and 25.`
- `Must be one of: layered, flat.`
- `Must be text.`
- `Must be true or false.`
- `Must be 1.`
- `Required: the place to model.`
- `At most 20 markers.`
- `At most 3 lines.`
- `Each line may hold at most 40 characters.`

**Text is cleaned, not trusted.** Text comes from people and geocoders, so `cleanRequestText` processes it before use:

- It removes zero-width characters, bidirectional formatting marks, and the byte-order mark.
- It turns control characters into spaces and collapses whitespace.
- It keeps newlines in `title` only.

A string up to four times the length limit is cut down to the limit. Only a longer string is rejected (`Must contain at most N characters.`). The schema's `maxLength` is stricter than the parser; see [Known gaps](#known-gaps).

### Where to get the schema

- Over REST, as `components.schemas.ProjectRequestV1` in `/v1/openapi.json`.
- Over MCP, as the resource `topostack://schema/project-request-v1`. This is the complete schema, including `$schema` and `$id`.
- In code, as `PROJECT_REQUEST_SCHEMA` from `@topostack/core/project`.

`ProjectRequestV1` is versioned like the other contracts. A change that would read an existing request differently needs `requestVersion: 2`, never a reinterpretation.

## Studio links

A studio link has this form:

```
<PUBLIC_ORIGIN>/studio?generate=1#p=1.<base64url(deflate-raw level 9 of the ProjectConfigV1 JSON)>
```

- **The design is in the fragment.** Browsers never send the fragment to a server, so the design does not appear in request logs.
- **Version prefix.** The `1.` after `p=` is the link-format version, separate from the project's `schemaVersion`.
- **`?generate=1`.** The studio generates the design as soon as it opens, then removes both the fragment and the query from the address bar. The shared design opens as a change the person can undo.
- **Precedence.** If a URL carries several start-up instructions, the studio applies `#p=`, then `?example=`, then `?lake=`.
- **Length limit.** A link can be at most 8,000 characters (`MAX_SHARE_URL_LENGTH`). Creating a longer one fails with 413, which usually means large custom lines. Decoding accepts at most 16,000 encoded characters and 2 MB inflated.
- **Decoding errors.** When decoding fails, the studio shows one of these messages:
  - `This share link was made by a newer or unknown version of TopoStack.`
  - `Share link is not valid.`
  - `Share link is damaged or incomplete.`
  - `Share link is too large.`

The same codec serves the studio's Share button (`shareUrl` and `decodeShareFragment`).

## REST routes

Every route answers CORS preflights and returns `access-control-allow-origin: *`. None of them uses credentials or cookies. The POST routes need `content-type: application/json` and a body of at most 128,000 bytes. `/v1/openapi.json` lists the request and response schemas, and a test checks real responses against them.

### `POST /v1/projects/resolve`

Validates a request and returns the full project it expands to.

```json
{ "project": { "schemaVersion": 1, "id": "agent-…", "name": "Mount Rainier", "outputMode": "stack", "…": "…" },
  "studioUrl": "https://topostack.app/studio?generate=1#p=1.…",
  "attribution": { "text": "…", "sources": [], "fullNotice": "https://topostack.app/attribution" } }
```

Use it when a script needs the exact `ProjectConfigV1`, for example to save it as a project file.

### `POST /v1/projects/plan`

Validates a request, samples terrain, and estimates the model. This is the route to call repeatedly while adjusting thickness, size, area, or exaggeration.

```jsonc
{
  "project": {
    "name": "Mount Rainier", "placeLabel": "Mount Rainier, Washington", "output": "layered",
    "widthMm": 300, "heightMm": 200, "shape": "rectangle",
    "materialThicknessMm": 3, "verticalExaggeration": 2,
    "bounds": { "west": -121.89, "south": 46.80, "east": -121.63, "north": 46.91 }
  },
  "plan": {
    "output": "layered", "sheetCount": 35, "heightOfModelMm": 105, "materialThicknessMm": 3,
    "requestedVerticalExaggeration": 2, "fittedVerticalExaggeration": 2, "metersPerStep": 104,
    "scaleDenominator": 66667, "groundWidthKm": 20, "groundHeightKm": 13.3,
    "minElevationM": 750, "maxElevationM": 4390, "reliefM": 3640, "estimate": true
  },
  "relief": { "sampleZoom": 10, "tiles": 2, "coastal": false },
  "coverage": { "terrain": { "base": "…", "highResolution": [] }, "lakeSurveys": [], "roadsAndWater": "…", "notes": ["…"] },
  "notes": ["Estimated from terrain sampled at zoom 10; peaks can be smoothed, so expect the studio's count to differ by a sheet or two. The studio's count is the one that is cut."],
  "studioUrl": "https://topostack.app/studio?generate=1#p=1.…",
  "attribution": { "text": "…", "sources": [], "fullNotice": "https://topostack.app/attribution" }
}
```

This example is abridged and the numbers are illustrative.

**Plan fields.**

- `sheetCount` is always 1 for flat output.
- `heightOfModelMm` is the stack height; for flat output it is the material thickness.
- `metersPerStep` is the elevation per sheet, or between engraved contours.
- `scaleDenominator` is the 1:N scale across the model's width.
- `estimate` is always `true`. The studio's count is the one that is cut.

**How relief is sampled** (`workers/map-api/src/agent/relief.ts`):

- The Worker picks the finest zoom from 12 down to 0 at which the crop fits in at most **four** terrain tiles.
- It fetches those tiles through its own terrain route, caches, and budgets.
- Only samples inside the crop count, and only inside the inscribed ellipse for a circle.
- A sample that would widen the range is ignored when it differs from the median of the ring two pixels away by more than 400 m, or by more than a 2.5:1 slope over those two pixels if that is larger. Low-zoom tiles contain small patches of bad samples (Lake Tahoe's zoom-10 tile reads +5,492 m beside 1,900 m ground); this drops them but keeps real summits.
- If the crop has samples at or below 0 m as well as land, it is treated as coastal. The sea is cut flat, so the minimum becomes 0 and the maximum is the highest land.
- A crop narrower than one sample uses the sample nearest its centre.

**Notes** explain the estimate in plain words, in this order:

1. Always: what zoom was sampled, and that the studio's count is authoritative.
2. Relief under 20 m: for flat output, `This area is nearly flat, so contour lines may be sparse.`; for layered output, a version that suggests a smaller area or more exaggeration.
3. Layered plans over 60 sheets: a note that thicker material or less exaggeration makes fewer sheets.
4. Coastal crops: the sea is cut flat.
5. Layered plans with surveyed lakes in the crop and `details.waterDepth` on: lake depth adds sheets that only the studio counts.
6. A model larger than `laser.workAreaWidthMm` × `laser.workAreaHeightMm`: each sheet is split into tabbed pieces.

### `POST /v1/projects/link`

Returns only a studio link: `{ "url": "…", "length": 1234 }`, where `length` is `url.length`. The body is either:

- a `ProjectRequestV1`; or
- `{ "project": <ProjectConfigV1> }`, for example the `project` of a saved `.topostack.json` file.

Any object with a `project` key takes the second form. An invalid project returns 422 with the parser's message in `error` and no `errors` list. The MCP tool `create_studio_link` returns more: the link plus a project summary and attribution.

### `GET /v1/coverage`

Lists the high-resolution terrain and lake surveys that reach an area, so expectations about detail can be set before planning.

- `?bbox=west,south,east,north` describes the area exactly.
- `?lat=&lon=&widthKm=` describes a square `widthKm` across.
- If both are given, `bbox` wins.

```json
{
  "terrain": {
    "base": "Mapzen Terrain Tiles (global, about 30 m or coarser)",
    "highResolution": [{ "id": "nrcan-hrdem-alexander-v1", "name": "…", "resolutionM": 1, "license": "…" }]
  },
  "lakeSurveys": [{ "id": "…", "name": "…", "license": "…" }],
  "roadsAndWater": "OpenStreetMap via Protomaps, worldwide",
  "notes": ["Terrain is land elevation; open sea is flat at sea level and lakes use survey or modeled depths."],
  "attribution": { "…": "…" }
}
```

A source counts when its bounding box overlaps the area. The response is cacheable for an hour.

### `GET /v1/geocode`

This is the studio's own place search, and agents may call it too.

- **Query.** `q` must have 2–160 characters after whitespace is normalized. `limit` is 1–8, default 5.
- **Response.** `[{ place_id, display_name, lat, lon, type? }]`, most important first.
- **How it searches.** Each lookup the cache cannot answer makes two Geoapify searches, the ordinary one and one limited to amenities, so named features such as parks and peaks outrank same-named towns.
- **Caching.**
  - Results are cached for a day, or five minutes when empty.
  - `x-topostack-cache` reports `HIT`, `MISS`, or `BYPASS`.
  - A `HEAD` request never reaches the provider.

The MCP `search_places` tool wraps this route. It adds a suggested `area` and a `surveyedLake` flag.

### `GET /v1/openapi.json`

The OpenAPI 3.1 document, cacheable for an hour. Its `version` is the Worker package version, and `servers[0].url` is the origin that served it.

## Errors and status codes

REST errors are JSON with `cache-control: no-store`:

```json
{ "error": "The project request is invalid.",
  "errors": [{ "path": "area.center.lon", "message": "Must be between -180 and 180." }, { "path": "output", "message": "Must be one of: layered, flat." }] }
```

`errors` is present only when there are field problems.

| Status | Routes | Meaning |
| --- | --- | --- |
| 400 | POST routes | `The request body is not valid JSON.` |
| 400 | `/v1/coverage` | Missing or malformed `bbox` or `lat`/`lon`/`widthKm`. Field paths use request names such as `area.center.lat`, not the query names. |
| 400 | `/v1/geocode` | `q` shorter than two characters. |
| 405 | all | Wrong method. The response's `allow` header names the right ones: `POST,OPTIONS` for `/v1/projects/*` and `/mcp`, and `GET,HEAD,OPTIONS` elsewhere. |
| 413 | POST routes | The body is over 128,000 bytes, or the design does not fit in an 8,000-character link. |
| 415 | POST routes and `/mcp` | `content-type` does not contain `application/json`. |
| 422 | POST routes | The request or project is invalid. |
| 429 | all | Out of budget; the response carries `retry-after: 60`. On `/plan`, `The terrain budget for this client is used up.` means tile sampling ran out, and the generic message means the agent budget did. |
| 502 | `/plan`, `/v1/geocode` | Terrain, or both geocoder searches, failed. |
| 503 | `/v1/geocode` | The geocoder is not configured on this server. |
| 504 | `/v1/geocode` | The geocoder timed out. |
| 500 | all | `Internal map service error.` |

## Rate limits and CORS

Chat platforms call from their own servers, so one address can stand for many people. The agent routes therefore have their own budget instead of sharing the browser's:

| Traffic | Budget |
| --- | --- |
| `POST /v1/projects/*` and every `/mcp` request | `AGENT_LIMITER`: 120 a minute per client. `AGENT_GLOBAL_LIMITER`: 1,200 a minute per Cloudflare location, checked only after the per-client limit passes. |
| Tile fetches for a plan that miss the cache | The terrain upstream budget, the same as the studio's. |
| `GET /v1/geocode` and `search_places` (MCP) | Lookups the cache cannot answer: `GEOCODE_LIMITER`, 30 a minute per client, then `GEOCODE_GLOBAL_LIMITER`, 300 a minute. `GET /v1/geocode` also draws on the `REQUEST_LIMITER` `geocode` bucket for every request. `search_places` does not, because the `/mcp` request was already charged to the agent budget. |
| `GET /v1/coverage`, `/v1/openapi.json`, the server card | `REQUEST_LIMITER`: 240 a minute per client, per route. |

- **Client key.** Clients are keyed by `cf-connecting-ip`; IPv6 addresses are grouped by their /64 prefix.
- **Scope.** Cloudflare counts limits per location, not account-wide.
- **Preflights.** `OPTIONS` preflights are never charged.

**CORS headers.**

- All routes: `access-control-allow-origin: *`, `access-control-max-age: 86400`.
- `/mcp` additionally allows the request headers `content-type`, `accept`, `authorization`, `mcp-protocol-version`, `mcp-session-id`, and `last-event-id`, and exposes `mcp-session-id` and `mcp-protocol-version`.
- The POST routes have no side effects, so leaving them open to every origin gives away nothing that the read-only routes do not.

## MCP server (`/mcp`)

The server speaks the standard MCP messages on its own, without an SDK at runtime. The official SDK client is used only in its tests.

### Transport

- **POST only.** Each POST carries one JSON-RPC message, and the reply is `application/json`.
  - There is no event stream and no session, so `GET` and `DELETE` return 405.
  - Notifications and client responses get `202` with an empty body.
  - Arrays (batches) are still accepted (see [Known gaps](#known-gaps)). A batch that holds only notifications gets 202.
- **Protocol versions.** `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05`.
  - `initialize` echoes the client's version if the server supports it and otherwise answers with the newest.
  - An unsupported `MCP-Protocol-Version` header gets HTTP 400 with JSON-RPC error `-32600`.
- **Size and type limits.** The 128,000-byte body limit and the JSON content type apply, and their 413 and 415 errors use the REST shape.
- **Methods.** `initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/templates/list` (always empty), `resources/read`, `prompts/list`, `prompts/get`.
- **Instructions.** `initialize` also returns `instructions` that describe the intended workflow: search, plan, preview, link.

| JSON-RPC code | When |
| --- | --- |
| `-32700` | The body is not JSON (HTTP 400). |
| `-32600` | Not a JSON-RPC 2.0 message, a bad `id`, an empty batch, or an unsupported protocol-version header. |
| `-32601` | Unknown method. |
| `-32602` | Unknown tool or prompt, missing tool name, non-object arguments, or a missing required prompt argument. |
| `-32002` | Unknown resource URI (`data.uri` names it). |
| `-32603` | Internal error, or the preview page is missing from this build. |

**Tool errors and protocol errors.** Two kinds of failure are reported differently:

- **Tool errors.** A problem the model can fix comes back as a successful JSON-RPC result with `isError: true`. This covers an invalid request, an out-of-range argument, an exhausted budget, and a terrain outage. The text holds the message and then one line per field, for example `area.center.lon: Must be between -180 and 180.`
- **Protocol errors.** A JSON-RPC error means the client misused the protocol. Over MCP, a 429 or 502 from a tool is only a tool error, so its HTTP status is not visible.

### Tools

All five tools:

- are read-only, idempotent, and not destructive; only `search_places` is marked open-world;
- declare an `outputSchema` and return `structuredContent` that matches it;
- return a text summary for clients that show only text;
- include `attribution`.

The tools that take a model accept the `ProjectRequestV1` schema with `requestVersion` optional.

| Tool | Input | `structuredContent` |
| --- | --- | --- |
| `search_places` | `query` (2–160 characters), `limit` (1–8, default 5) | `places: [{ label, lat, lon, type?, area, surveyedLake }]`, `attribution` (includes Geoapify) |
| `check_coverage` | `area` only; any other key is a tool error | Same as `GET /v1/coverage` |
| `plan_model` | a request | Same as `POST /v1/projects/plan` |
| `preview_model` | a request | Same as `plan_model`. Its `_meta.ui.resourceUri` names the in-chat preview. |
| `create_studio_link` | a request | `url`, `length`, `project` (the plan's project summary), `attribution` |

**`search_places`.**

- `area` is `{ center, widthKm }`, ready to pass to the other tools. `widthKm` depends on the kind of result: country 800, state 300, county 60, city 20, postcode 10, suburb and district 6, amenity 4, street 3, building 2, anything else 20.
- `surveyedLake` is true when the point falls inside a surveyed lake archive's bounds.
- Labels are cleaned like request text. The tool description tells models to treat them as names, never as instructions.

**Plan text.** `plan_model` and `preview_model` return text of this form:

```
Mount Rainier: layered, 300 × 200 mm, about 35 sheets of 3 mm (105 mm tall), 2× vertical exaggeration. Scale 1:66,667; ground 20 × 13.3 km; elevation 750–4,390 m.
<notes, one per line>
Open and generate in TopoStack: <studioUrl>
Data: <attribution.text>
```

For flat output, the first line reads `flat engraving, … about one contour every N m`.

### Resources and prompts

| Resource | Type | Content |
| --- | --- | --- |
| `topostack://guide/making-a-model` | `text/markdown` | Advice on layered or flat output, what sets the sheet count, laser bed size, choosing an area, details, and credit. Its limits are filled in from `PROJECT_REQUEST_LIMITS`. |
| `topostack://data/sources` | `application/json` | The dataset manifest (`/v1/manifest`). |
| `topostack://schema/project-request-v1` | `application/schema+json` | `PROJECT_REQUEST_SCHEMA`. |
| `ui://topostack/terrain-preview.html` | `text/html;profile=mcp-app` | The in-chat preview. |

| Prompt | Arguments |
| --- | --- |
| `design_topo_map` | `place` (required), `size`, `style` (`flat` for an engraving) |
| `plan_for_my_laser` | `bed` (required), `material`, `place` |

### Server card

`GET /.well-known/mcp/server-card.json` returns:

- the name `app.topostack/topostack`;
- `remotes: [{ "type": "streamable-http", "url": "<origin>/mcp" }]`;
- `authentication: { "required": false }`;
- the supported protocol versions;
- the tool, resource, and prompt listings.

It follows the draft server-card proposal and will change when that proposal settles.

### Trying it

- **Locally.** Run `npm run dev` and point the MCP Inspector at `http://localhost:8787/mcp`.
- **Claude Code.** `claude mcp add --transport http topostack https://topostack.app/mcp`.
- **Other clients.** Setup for other chat clients and editors is in the user guide.

## In-chat preview (MCP App)

`preview_model` returns the same plan as `plan_model`, and hosts that support MCP Apps also render `ui://topostack/terrain-preview.html` in an iframe.

**How the Worker serves the page.**

- The page is the generator's `dist/mcp-app/terrain-preview.html`, a single file built by `apps/generator/vite.mcp-app.config.ts` as part of the generator build.
- The Worker reads it through its `ASSETS` binding and replaces `%TOPOSTACK_API_ORIGIN%` with its own origin.
- The resource's `_meta.ui.csp.connectDomains` names only that origin, so the page can fetch terrain and map data from TopoStack and nothing else.
- Without a generator build, reading the resource fails with `-32603` and a message saying so.

**How the page works** (`apps/generator/src/mcp-app/`).

- **Bridge.** `host.ts` implements the host side of the MCP Apps protocol, version `2026-01-26`, over `postMessage`. It accepts messages from the parent window only. It sends:
  - `ui/initialize`
  - `ui/notifications/initialized`
  - `ui/notifications/size-changed`
  - `ui/open-link`

  and answers the host's `ping` and `ui/resource-teardown` requests.
- **Generation.** On `ui/notifications/tool-result`, the page decodes the plan's `studioUrl` fragment and runs `parseProject`. It then calls the real `loadTerrain` and `generateGeometry` in the iframe and draws the result as SVG:
  - a layered model as tilted stacked sheets;
  - a flat model as contours, with every fifth line heavier.
- **What the preview leaves out.** To stay quick, the preview drops roads, trails, labels, the grid, the north arrow, the scale bar, markers, custom lines, the plaque, and placed graphics.
- **Other notifications.** `ui/notifications/host-context-changed` switches the theme, and `ui/notifications/tool-cancelled` stops a run.
- **Open in TopoStack.** The button asks the host to open the studio link. If the host refuses, the page shows the link instead.

**Budget.** The build is budgeted as `mcpAppHtmlGzip` in `scripts/build/check-web-budget.mjs`.

## WebMCP in the studio

When the browser offers `navigator.modelContext` (or `document.modelContext`), the studio registers tools so an agent in the browser can edit the open design.

- **Where tools register.** Not in the Atomm embed or the Atomm build.
- **Loading.** The module is loaded lazily after mount. The budget script fails if it reaches the studio's first paint.
- **Undo.** Every change goes through the studio's own update, generate, and undo paths, so each change the agent makes is one undo step.

| Tool | Input | What it does |
| --- | --- | --- |
| `topostack_get_design` | none | Returns the design as a `ProjectRequestV1` (`describeProject`) with generation status (`ready`, `loading`, or `error`), the sheet count once generated, and whether export is ready or what blocks it. Read-only. |
| `topostack_search_places` | `query` | Studio place search, with a suggested `area` per result. Read-only. |
| `topostack_set_area` | `area`, `placeLabel?` | Moves the design. The name becomes the label's first part. |
| `topostack_update_design` | the `ProjectRequestV1` settings except `area` and `markers` | Changes only what is given; an empty change replies `Nothing to change.` |
| `topostack_generate_preview` | none | Generates, as the Generate button does. A failure returns `isError`. |
| `topostack_undo` | none | Undoes the last change. |
| `topostack_open_export` | none | Opens the Export dialog. It downloads nothing itself. |

The inputs use `PROJECT_REQUEST_PATCH_SCHEMA` and `parseProjectRequestPatch`, the same limits as the request.

## Attribution

Every REST response and MCP tool result that uses map data carries:

```json
{ "text": "Terrain: Mapzen Terrain Tiles and its sources · Map data © OpenStreetMap contributors (ODbL) · Lakes: HydroLAKES (CC BY 4.0), GLOBathy (CC0)",
  "sources": [{ "name": "OpenStreetMap contributors", "license": "ODbL", "url": "…" }],
  "fullNotice": "https://topostack.app/attribution" }
```

- **Sources.** The base sources are always listed. Regional high-resolution terrain and lake surveys in the area are appended, and `search_places` adds Geoapify.
- **Keeping it.** Anything shown or passed on from a result must keep `text`. The MCP server's instructions and the tool descriptions say so to models.

## Known gaps

These behaviours are deliberate for now, or waiting on a follow-up. Clients should not depend on any of them.

- **Text length.** The parser truncates text up to four times its limit, while the schema's `maxLength` would reject it. Schema-validating clients are stricter than the server.
- **Schema `$id`.** `https://topostack.app/schemas/project-request-v1.json` is an identifier only; nothing is served there.
- **Batches.** `/mcp` accepts JSON-RPC batches, although MCP removed them in 2025-06-18.
- **Header checks.** `/mcp` does not check `Accept`, and it accepts requests that have no `MCP-Protocol-Version` header.
- **Error shape.** 413 and 415 from `/mcp` use the REST error shape, not JSON-RPC.
- **Coverage error paths.** `/v1/coverage` error paths name request fields (`area.center.lat`) rather than query parameters.
- **Usage events.** Agent calls are logged per request (`request_completed`), but no usage events are recorded for them.

## Changing the API

- **Request contract.** Change `ProjectRequestV1`, its limits, and `PROJECT_REQUEST_SCHEMA` together. `request.test.ts` checks that Ajv and the parser agree. A change that alters what an existing request means needs a new `requestVersion`.
- **Response shape.** Change the schema in `workers/map-api/src/agent/schemas.ts`. The MCP `outputSchema` and the OpenAPI components both read it, and `agent-routes.test.ts` validates real responses against the OpenAPI document.
- **Status codes.** A new status on a route belongs in that route's `responses` in `openapi.ts`. The OpenAPI test checks the statuses the other tests provoke.
- **Routes.** A new REST route goes in `AGENT_ROUTES`, which the OpenAPI test compares with `paths`.
- **Tools, resources, and prompts.** A new MCP tool, resource, or prompt also appears in the server card; update `mcp.test.ts`, which pins the listings.
- **Bundle budgets.** The Worker must stay free of geometry code: `scripts/build/check-worker-bundle.mjs` enforces a gzip budget and forbids generation identifiers. The preview has its own budget, `mcpAppHtmlGzip`.
- **Docs to update.**
  - this page;
  - the route table in [workers/map-api/README.md](../workers/map-api/README.md#agent-api);
  - `llms.txt` (`apps/generator/src/routes/llms.txt/+server.ts`), if discovery changes;
  - the developer guides at `apps/generator/src/routes/guides/http-api/` and `mcp-server/`, and the maker guide at `use-with-ai-assistants/`.
