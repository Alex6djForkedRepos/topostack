# Agent API, MCP server, and in-studio agent tools

This is the design record. The maintained contributor reference is [../mcp.md](../mcp.md); the public references are the site guides `/guides/mcp-server`, `/guides/agent-api` and `/guides/browser-agents`.

## Context

Makers increasingly start a project in a chat: "make me a layered map of Mount Rainier for 3 mm plywood". TopoStack should let an AI assistant do that directly, and let scripts do it over HTTP, for both layered (stacked sheets) and flat (engraved contours) output.

Today every model is generated in the visitor's browser. `@topostack/core` runs in Web Workers; the `map-api` Worker streams terrain, PMTiles and geocoding and serves the static site. There are no accounts and no server-side persistence. Core itself is pure and runs in Node, but building a `SourceBundleV1` (`loadTerrain` in `apps/generator/src/lib/domain/data-provider.ts`) is tied to the app.

Decisions:
- **Phased compute, client first.** Phase 1 generates no geometry on a server. Agents get validated projects, stack plans, studio links, and an in-chat preview that runs core in the chat host's iframe. Server-side SVG/ZIP generation is phase 2.
- **Anonymous, rate-limited.** No keys or accounts in phase 1, matching the no-account product. Identity arrives with phase 2 compute.

## Where WebMCP fits

[WebMCP](https://blog.cloudflare.com/webmcp/) (`document.modelContext.registerTool`; Chrome 146+ behind a flag or origin trial, with `navigator.modelContext` deprecated in Chrome 150) exposes a page's tools to an agent that is driving that page in a browser tab: Chrome's built-in agent, Claude in Chrome, Cloudflare Browser Run. It does not reach claude.ai, ChatGPT or IDE chats, which connect to **remote MCP servers** over Streamable HTTP and render interactive UI through **MCP Apps** (`ui://` resources).

So WebMCP is not the distribution channel; it is a second surface:
- **Primary:** a remote MCP server at `https://topostack.app/mcp` on the existing Worker, plus an MCP App that previews the model inside the chat.
- **Complementary:** hand-registered WebMCP tools in `/studio` so a browser agent can drive the live design (area, settings, generate, open Export).
- **Cloudflare's dashboard WebMCP toggle stays off.** Its edge-injected bridge would register the chat-oriented `/mcp` tools next to the studio's state-changing ones, and its injected script is unverified against the studio's hash-based `script-src` and the prerendered-HTML budgets. Revisit once verified.

## Architecture (phase 1)

```text
Chat assistant ──MCP──► Worker /mcp ─┐   validate, sample relief, plan the stack, mint a studio link
Script ────────REST──► /v1/projects/* ┘   imports @topostack/core/project only; never traces contours
Chat host iframe ◄── ui://topostack/terrain-preview.html   runs core client-side against /v1 tiles
Browser agent ─WebMCP─► /studio          lazy-loaded tools edit the live design
Every path ends at /studio?generate=1#p=1.<design> → files are exported in the browser
```

One contract serves every surface: `ProjectRequestV1` and its JSON Schema in `@topostack/core/project`.

### The request contract (`packages/core/src/project/`)

| Module | Holds |
| --- | --- |
| `parse.ts` | `parseProject`, the untrusted-JSON reader for saved projects, imported files and share links (moved from the generator's storage layer) |
| `bounds.ts` | The crop: Mercator helpers, `fitCutBounds`, `boundsForProject`, `coverBounds`, `boundsAround`, `zoomForBounds` |
| `request.ts` | `ProjectRequestV1`, `parseProjectRequest` (field-path errors), `expandProjectRequest`, `requestPatch`, `describeProject`, text cleaning |
| `schema.ts` | `PROJECT_REQUEST_SCHEMA` (JSON Schema 2020-12 / OpenAPI 3.1) and its patch and sub-schemas, built from the parser's limits |
| `plan.ts` | `planFromRelief`: sheet count, stack height, fitted exaggeration and scale from a relief sample |

A request names an area (`{ center, widthKm }` or `{ bounds }`), a size, `output: "layered" | "flat"`, thickness, exaggeration, contour count, detail switches, an optional title, laser kerf and bed, and up to 20 markers. Fonts, line styles, custom graphics and depth charts are left to the studio. Expansion starts from `DEFAULT_PROJECT`, clamps the north arrow to the model size, and passes `parseProject`; the project id hashes the request, so the same request always yields the same link. The share-link codec moved to `@topostack/data-contracts/share-link` so the Worker can mint links.

### REST (`workers/map-api/src/agent/`)

| Route | Returns |
| --- | --- |
| `POST /v1/projects/resolve` | The expanded `ProjectConfigV1` and a studio link, or 422 with `{ errors: [{ path, message }] }` |
| `POST /v1/projects/plan` | A stack plan from a sampled relief (at most 4 low-zoom Terrarium tiles through the existing terrain cache and budgets), coverage, attribution and the link |
| `POST /v1/projects/link` | A studio link for a request or a full project; 413 past the 8,000-character link limit |
| `GET /v1/coverage` | Which high-resolution terrain and lake surveys cover an area |
| `GET /v1/openapi.json` | The OpenAPI 3.1 document, embedding the request schema |

The plan is an estimate: coarse tiles smooth peaks, and lake depth adds sheets that only generation can count. The studio's count is authoritative. The Worker imports only `@topostack/core/project` (an ESLint rule and a bundle check enforce it); sampling elevation is not contour generation.

### MCP (`workers/map-api/src/mcp/`)

A stateless Streamable HTTP JSON-RPC handler with no runtime dependencies, answering in `application/json`. The SDK is a dev dependency used for conformance tests; `agents`' `createMcpHandler` is reconsidered in phase 2 for OAuth.

- **Tools** (read-only, idempotent, with `outputSchema`, structured content, a text fallback and attribution): `search_places`, `check_coverage`, `plan_model`, `preview_model` (opens the MCP App), `create_studio_link`.
- **Resources:** a guide to layered vs flat output and material choice, the data sources and licenses, the request schema, and the preview app.
- **Prompts:** `design_topo_map`, `plan_for_my_laser`.
- **Discovery:** `/.well-known/mcp/server-card.json` (experimental), `llms.txt`, and a guide page for connecting Claude, ChatGPT, VS Code and browser agents.

### The MCP App (`apps/generator/src/mcp-app/`)

A single-file HTML bundle built from the generator's sources (`vite.mcp-app.config.ts`). It speaks the MCP Apps postMessage protocol through a small hand-written bridge (the reference SDK brings React and the v2 SDK along), receives the tool result, decodes the design from its studio link, and loads terrain from the Worker that served it (the only origin in the resource's CSP `connectDomains`). It generates with `generateGeometry` without the engraved details (roads, labels, markers, title), which do not change the stack but cost most of the time, and draws stacked sheets or contour lines with stats, attribution and an "Open in TopoStack" button. The Worker serves it through its `ASSETS` binding.

### WebMCP (`apps/generator/src/lib/studio/webmcp*.ts`)

Loaded only when `document.modelContext` (or `navigator.modelContext`) exists, never in the Atomm embed, and kept off the startup path. Tools are prefixed `topostack_`: get design, search places, set area, update design, generate preview, undo, open export. Edits go through the studio's own update functions so undo history holds. `topostack_open_export` only opens the dialog; downloading stays a user action.

## Delivery

Phase 1 shipped as the six steps below. Measured on real terrain, plans agree with generation within a sheet or two (Mount Rainier 35 planned / 36 generated, Lake Tahoe 9 / 9, Matterhorn 45 / 45, Big Sur coast 12 / 14). Low-zoom tiles carry small artifact patches, which the sampler ignores by comparing each extreme sample with the ring two pixels out.

1. Shared contracts: core `project/`, the data-contracts share-link codec. No user-visible change.
2. REST on the Worker, limiters (`AGENT_LIMITER`, `AGENT_GLOBAL_LIMITER`), `PUBLIC_ORIGIN`, the source alias, the Worker bundle check, OpenAPI.
3. `/mcp`, the server card, SDK conformance tests.
4. The MCP App, the generator's api-base seam, the `ASSETS` binding.
5. Studio `?generate=1` links and WebMCP.
6. Guide page, `llms.txt`, docs, changelog.

## Phase 2 (outline)

1. Extract `loadTerrain` and its domain modules into a runtime-neutral package with injected `fetch`, API base, fonts and chart store.
2. Run generation, packaging and sparrow nesting in a Node container (Cloudflare Containers). Sparrow's deadline cannot tick inside a Worker, whose clock stands still during CPU work.
3. A job API: `POST /v1/jobs`, progress, outputs in R2 behind short-lived signed URLs with a 24–48 h lifecycle, state in a Durable Object or D1.
4. Async MCP tools (`generate_files`, `get_job`) and a download button in the MCP App.
5. OAuth 2.1 for MCP connectors, API keys for REST, per-user quotas; this is where roadmap item 4 (identity adapter) lands.

## Risks

- **Shared egress addresses.** Chat platforms call connectors from their own servers, so one address stands for many users. Agent routes get their own limiters with a global ceiling; per-user quotas wait for phase 2.
- **Licensing.** Every response carries attribution derived from the manifest (OpenStreetMap ODbL, HydroLAKES CC BY 4.0, survey licenses, Geoapify). Geoapify's terms for API-served results need review.
- **Prompt injection.** Geocoder labels and names are untrusted: control and bidirectional characters are stripped, lengths capped, and they travel only as structured fields.
- **Moving specifications.** MCP Apps metadata keys, the WebMCP namespace and server cards are isolated in one module each.
