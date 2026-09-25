import { PROJECT_REQUEST_SCHEMA } from "@topostack/core/project";

/**
 * The OpenAPI 3.1 description of the agent routes. The request schema is the
 * one `parseProjectRequest` is tested against, so the document cannot drift
 * from what the routes accept. The route table test keeps the paths honest.
 */
const { $schema: _dialect, $id: _id, ...projectRequest } = PROJECT_REQUEST_SCHEMA;

const errorResponse = (description: string) => ({ description, content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } });
const jsonBody = (ref: string) => ({ required: true, content: { "application/json": { schema: { $ref: ref } } } });

export const AGENT_ROUTES = ["/v1/projects/resolve", "/v1/projects/plan", "/v1/projects/link", "/v1/coverage", "/v1/geocode", "/v1/openapi.json"] as const;

/** `apiOrigin` serves these routes; `siteOrigin` hosts the studio and the attribution page (the same host except in local development). */
export function openApiDocument(apiOrigin: string, siteOrigin: string, version: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "TopoStack API",
      version,
      summary: "Plan laser-cut terrain models and hand them to the TopoStack studio.",
      description: "Describe a place and a model (layered stack or flat engraving), get it validated, estimate its sheets from sampled terrain, and receive a studio link that opens and generates it. Files are generated and exported in the browser. Anonymous and rate limited; responses carry attribution that must be kept with anything derived from them. An MCP server with the same operations is at /mcp.",
      license: { name: "Data licenses vary by source", url: new URL("/attribution", siteOrigin).toString() },
    },
    servers: [{ url: apiOrigin }],
    paths: {
      "/v1/projects/resolve": {
        post: {
          operationId: "resolveProject",
          summary: "Validate a request and expand it into a full project",
          requestBody: jsonBody("#/components/schemas/ProjectRequestV1"),
          responses: {
            "200": { description: "The expanded ProjectConfigV1, its studio link, and attribution.", content: { "application/json": { schema: { type: "object", required: ["project", "studioUrl", "attribution"], properties: { project: { type: "object" }, studioUrl: { type: "string", format: "uri" }, attribution: { $ref: "#/components/schemas/Attribution" } } } } } },
            "413": errorResponse("The body or the resulting link is too large."),
            "415": errorResponse("The body is not application/json."),
            "422": errorResponse("The request is invalid; `errors` lists each field."),
            "429": errorResponse("Rate limited."),
          },
        },
      },
      "/v1/projects/plan": {
        post: {
          operationId: "planProject",
          summary: "Estimate sheets, stack height and scale from sampled terrain",
          description: "Samples at most four low-zoom terrain tiles. The sheet count is an estimate; the studio's is authoritative.",
          requestBody: jsonBody("#/components/schemas/ProjectRequestV1"),
          responses: {
            "200": { description: "The plan, coverage, notes, studio link and attribution.", content: { "application/json": { schema: { $ref: "#/components/schemas/ProjectPlan" } } } },
            "422": errorResponse("The request is invalid."),
            "429": errorResponse("Rate limited."),
            "502": errorResponse("Terrain is unavailable."),
          },
        },
      },
      "/v1/projects/link": {
        post: {
          operationId: "linkProject",
          summary: "Mint a studio link for a request or a full project",
          requestBody: { required: true, content: { "application/json": { schema: { oneOf: [{ $ref: "#/components/schemas/ProjectRequestV1" }, { type: "object", required: ["project"], properties: { project: { type: "object", description: "A ProjectConfigV1, such as a saved project file's `project`." } } }] } } } },
          responses: {
            "200": { description: "The link.", content: { "application/json": { schema: { type: "object", required: ["url", "length"], properties: { url: { type: "string", format: "uri" }, length: { type: "integer" } } } } } },
            "413": errorResponse("The design does not fit in a link."),
            "422": errorResponse("The request or project is invalid."),
          },
        },
      },
      "/v1/coverage": {
        get: {
          operationId: "areaCoverage",
          summary: "Which high-resolution terrain and lake surveys cover an area",
          parameters: [
            { name: "bbox", in: "query", schema: { type: "string" }, description: "west,south,east,north in degrees." },
            { name: "lat", in: "query", schema: { type: "number" } },
            { name: "lon", in: "query", schema: { type: "number" } },
            { name: "widthKm", in: "query", schema: { type: "number" } },
          ],
          responses: { "200": { description: "Coverage and attribution." }, "400": errorResponse("Give bbox, or lat, lon and widthKm.") },
        },
      },
      "/v1/geocode": {
        get: {
          operationId: "searchPlaces",
          summary: "Search for a place by name",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string", minLength: 2, maxLength: 160 } },
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 8, default: 5 } },
          ],
          responses: {
            "200": { description: "Matches from Geoapify (© OpenStreetMap contributors).", content: { "application/json": { schema: { type: "array", items: { type: "object", properties: { place_id: { type: "string" }, display_name: { type: "string" }, lat: { type: "number" }, lon: { type: "number" }, type: { type: "string" } } } } } } },
            "429": errorResponse("Rate limited."),
          },
        },
      },
      "/v1/openapi.json": { get: { operationId: "openApi", summary: "This document", responses: { "200": { description: "OpenAPI 3.1" } } } },
    },
    components: {
      schemas: {
        ProjectRequestV1: projectRequest,
        Error: { type: "object", required: ["error"], properties: { error: { type: "string" }, errors: { type: "array", items: { type: "object", properties: { path: { type: "string" }, message: { type: "string" } } } } } },
        Attribution: { type: "object", properties: { text: { type: "string" }, sources: { type: "array", items: { type: "object" } }, fullNotice: { type: "string", format: "uri" } } },
        ProjectPlan: {
          type: "object",
          properties: {
            project: { type: "object" },
            plan: { type: "object", properties: { sheetCount: { type: "integer" }, heightOfModelMm: { type: "number" }, fittedVerticalExaggeration: { type: "number" }, scaleDenominator: { type: "integer" }, reliefM: { type: "number" }, estimate: { const: true } } },
            relief: { type: "object" },
            coverage: { type: "object" },
            notes: { type: "array", items: { type: "string" } },
            studioUrl: { type: "string", format: "uri" },
            attribution: { $ref: "#/components/schemas/Attribution" },
          },
        },
      },
    },
  };
}
