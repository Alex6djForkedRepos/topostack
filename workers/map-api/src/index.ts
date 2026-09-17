import { measureBucket } from "./data-metrics";
import { clientKey, corsHeaders, isAllowedOrigin, json, rateLimitExceeded, withCors } from "./http";
import { buildManifest } from "./manifest";
import { ARCHIVE_ROUTES, bathymetryArchives, type ArchiveRoute, parseRangeHeader, pmtilesResponse, terrainArchives } from "./routes/archive";
import { geocodeLimit, geocodeResponse, isGeocoderConfigured, normalizeGeoapify } from "./routes/geocode";
import { healthResponse, probeUpstreams, readinessResponse, upstreamHealth } from "./routes/health";
import { terrainResponse, validTile } from "./routes/terrain";
import { collectUsage } from "./usage-events";

type Handler = (request: Request, env: Env, ctx: ExecutionContext, url: URL) => Promise<Response> | Response;

const NOT_FOUND_BUCKET = "not-found";
const TERRAIN_TILE_PATH = /^\/v1\/terrain\/(\d+)\/(\d+)\/(\d+)\.png$/;

// Per-client request budget. Archive range reads and terrain cache hits are
// R2-backed and arrive in bursts of hundreds during one generation, so they are
// not charged here; terrain charges the budget only for HEAD and before an
// upstream fetch.
async function withinRequestBudget(request: Request, env: Env, bucket: string): Promise<boolean> {
  const { success } = await env.REQUEST_LIMITER.limit({ key: `${clientKey(request)}:${bucket}` });
  return success;
}

const TERRAIN_GLOBAL_LIMIT_KEY = "terrain-global";

// Per-client first so a client already over its own budget cannot also drain
// the shared per-colo ceiling that protects origin fetches and cache writes.
async function withinTerrainUpstreamBudget(request: Request, env: Env): Promise<boolean> {
  if (!(await withinRequestBudget(request, env, "terrain"))) return false;
  const { success } = await env.TERRAIN_GLOBAL_LIMITER.limit({ key: TERRAIN_GLOBAL_LIMIT_KEY });
  if (!success) console.warn(JSON.stringify({ message: "terrain_global_budget_exceeded" }));
  return success;
}

// Range reads of a present archive stay unmetered. Metadata-only requests
// (HEAD, If-None-Match) re-resolve from R2 each time, and missing or invalid
// archives answer 404/503; both are charged so they cannot become an unmetered
// R2 read loop.
async function archiveResponse(request: Request, env: Env, archive: ArchiveRoute): Promise<Response> {
  if ((request.method === "HEAD" || request.headers.has("if-none-match")) && !(await withinRequestBudget(request, env, "archive-meta"))) {
    return rateLimitExceeded();
  }
  const response = await pmtilesResponse(request, env, archive);
  if ((response.status === 404 || response.status === 503) && !(await withinRequestBudget(request, env, NOT_FOUND_BUCKET))) {
    await response.body?.cancel();
    return rateLimitExceeded();
  }
  return response;
}

function limited(bucket: string, handler: Handler): Handler {
  return async (request, env, ctx, url) => (await withinRequestBudget(request, env, bucket)) ? handler(request, env, ctx, url) : rateLimitExceeded();
}

const EXACT_ROUTES = new Map<string, Handler>([
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
  if (archive) return archiveResponse(request, env, archive);
  const terrainMatch = TERRAIN_TILE_PATH.exec(url.pathname);
  if (terrainMatch) {
    const tile = validTile(terrainMatch[1] ?? "", terrainMatch[2] ?? "", terrainMatch[3] ?? "");
    if (!tile) return json({ error: "Invalid terrain tile coordinates." }, { status: 400 });
    // HEAD reads R2 metadata on every call (no memo), so it is metered in its
    // own bucket rather than competing with the upstream-miss budget.
    if (request.method === "HEAD" && !(await withinRequestBudget(request, env, "terrain-head"))) return rateLimitExceeded();
    return terrainResponse(request, env, ctx, tile, { admitUpstream: () => withinTerrainUpstreamBudget(request, env) });
  }
  // One fixed bucket: a path-derived key would let callers mint fresh budgets
  // or drain the real terrain/geocode buckets with 404s.
  return limited(NOT_FOUND_BUCKET, () => json({ error: "Not found." }, { status: 404 }))(request, env, ctx, url);
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
