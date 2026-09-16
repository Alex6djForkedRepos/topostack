import { measureBucket } from "./data-metrics";
import { clientKey, corsHeaders, isAllowedOrigin, json, rateLimitExceeded, withCors } from "./http";
import { buildManifest } from "./manifest";
import { ARCHIVE_ROUTES, bathymetryArchives, parseRangeHeader, pmtilesResponse, terrainArchives } from "./routes/archive";
import { geocodeLimit, geocodeResponse, isGeocoderConfigured, normalizeGeoapify } from "./routes/geocode";
import { healthResponse, probeUpstreams, readinessResponse, upstreamHealth } from "./routes/health";
import { terrainResponse, validTile } from "./routes/terrain";
import { collectUsage } from "./usage-events";

type Handler = (request: Request, env: Env, ctx: ExecutionContext, url: URL) => Promise<Response> | Response;

const TERRAIN_TILE_PATH = /^\/v1\/terrain\/(\d+)\/(\d+)\/(\d+)\.png$/;

// Per-client request budget. Archive range reads and terrain cache hits are
// R2-backed and arrive in bursts of hundreds during one generation, so they are
// not charged here; terrain charges the budget only before an upstream fetch.
async function withinRequestBudget(request: Request, env: Env, bucket: string): Promise<boolean> {
  const { success } = await env.REQUEST_LIMITER.limit({ key: `${clientKey(request)}:${bucket}` });
  return success;
}

function limited(bucket: string, handler: Handler): Handler {
  return async (request, env, ctx, url) => (await withinRequestBudget(request, env, bucket)) ? handler(request, env, ctx, url) : rateLimitExceeded();
}

const EXACT_ROUTES = new Map<string, Handler>([
  ["/", limited("root", (_request, env) => healthResponse(env))],
  ["/health", limited("root", (_request, env) => healthResponse(env))],
  ["/ready", limited("root", (_request, env) => readinessResponse(env))],
  ["/v1/upstream-health", limited("upstream-health", (_request, env) => upstreamHealth(env))],
  ["/v1/manifest", limited("manifest", (_request, env) => json(
    buildManifest(env.DATASET_VERSION, terrainArchives, bathymetryArchives),
    { headers: { "cache-control": "public, max-age=3600" } },
  ))],
  ["/v1/geocode", limited("geocode", (request, env, ctx, url) => geocodeResponse(request, env, ctx, url))],
]);

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (!isAllowedOrigin(request.headers.get("origin"), env)) return json({ error: "Origin is not allowed." }, { status: 403 });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (url.pathname === "/v1/events") {
    if (request.method !== "POST") return json({ error: "Method not allowed." }, { status: 405, headers: { allow: "POST,OPTIONS" } });
    if (!(await withinRequestBudget(request, env, "events"))) return rateLimitExceeded("Rate limit exceeded.");
    return collectUsage(request, env.ENVIRONMENT);
  }
  if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "Method not allowed." }, { status: 405, headers: { allow: "GET,HEAD,OPTIONS" } });

  const exact = EXACT_ROUTES.get(url.pathname);
  if (exact) return exact(request, env, ctx, url);
  const archive = ARCHIVE_ROUTES.get(url.pathname);
  if (archive) return pmtilesResponse(request, env, archive);
  const terrainMatch = TERRAIN_TILE_PATH.exec(url.pathname);
  if (terrainMatch) {
    const tile = validTile(terrainMatch[1] ?? "", terrainMatch[2] ?? "", terrainMatch[3] ?? "");
    if (!tile) return json({ error: "Invalid terrain tile coordinates." }, { status: 400 });
    return terrainResponse(request, env, ctx, tile, { admitUpstream: () => withinRequestBudget(request, env, "terrain") });
  }
  return limited(url.pathname.split("/")[2] ?? "root", () => json({ error: "Not found." }, { status: 404 }))(request, env, ctx, url);
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    await probeUpstreams(env, ctx);
  },
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    try {
      const startedAt = Date.now();
      const metrics = { r2Reads: 0, r2Writes: 0 };
      const measuredEnv = { ...env, MAP_CACHE: measureBucket(env.MAP_CACHE, metrics), VECTOR_DATA: measureBucket(env.VECTOR_DATA, metrics) };
      const response = await route(request, measuredEnv, ctx);
      response.headers.set("x-topostack-r2-reads", String(metrics.r2Reads));
      // Cache-miss failures must be visible even when fixed canaries hit R2.
      console.log(JSON.stringify({ message: "request_completed", method: request.method, path: url.pathname, environment: env.ENVIRONMENT, status: response.status, cache: response.headers.get("x-topostack-cache"), durationMs: Date.now() - startedAt, ...metrics }));
      return withCors(response, request, env);
    } catch (error) {
      console.error(JSON.stringify({ message: "request_failed", path: url.pathname, error: error instanceof Error ? error.message : String(error) }));
      return withCors(json({ error: "Internal map service error." }, { status: 500 }), request, env);
    }
  },
} satisfies ExportedHandler<Env>;

export { geocodeLimit, isAllowedOrigin, isGeocoderConfigured, normalizeGeoapify, parseRangeHeader, validTile };
