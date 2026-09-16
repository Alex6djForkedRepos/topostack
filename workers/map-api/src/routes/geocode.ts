import { BodyTooLargeError, readBounded } from "../body";
import { readCache, writeCache } from "../cache";
import { clientKey, json, rateLimitExceeded, upstreamFailure, upstreamSignal } from "../http";

const MAX_GEOCODER_BYTES = 256_000;
const GEOCODE_CACHE_SECONDS = 60 * 60 * 24;
// Empty answers are often transient (partial queries, provider hiccups); keep
// them out of R2 and let browsers hold them only briefly.
const EMPTY_GEOCODE_CACHE_SECONDS = 5 * 60;
// Missing Origin headers are allowed and CORS is not access control, so a
// shared budget caps provider spend across every client. It has its own
// GEOCODE_GLOBAL_LIMITER binding so generic request traffic cannot drain it.
// Ratelimit bindings count per Cloudflare location, not account-wide: this is
// a per-colo ceiling, and the provider-side daily cap configured in the
// Geoapify dashboard remains the real spend limit.
export const GEOCODE_GLOBAL_LIMIT_KEY = "geocode-global";

interface GeoapifyResult { lat?: unknown; lon?: unknown; formatted?: unknown; place_id?: unknown; result_type?: unknown }

export function normalizeGeoapify(payload: unknown): Array<{ place_id: string; display_name: string; lat: number; lon: number; type?: string }> {
  const results = payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results) ? (payload as { results: GeoapifyResult[] }).results : [];
  return results.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const lat = item.lat;
    const lon = item.lon;
    const label = typeof item.formatted === "string" ? item.formatted.trim() : "";
    if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -85.0511 || lat > 85.0511 || typeof lon !== "number" || !Number.isFinite(lon) || lon < -180 || lon > 180 || !label) return [];
    return [{ place_id: String(item.place_id ?? (String(lat) + "," + String(lon) + "," + String(index))), display_name: label, lat, lon, ...(typeof item.result_type === "string" ? { type: item.result_type } : {}) }];
  });
}

export function geocodeLimit(value: string | null): number {
  if (value === null || value.trim() === "") return 5;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(8, Math.trunc(parsed))) : 5;
}

export function isGeocoderConfigured(env: Pick<Env, "GEOCODER_API_KEY">): boolean {
  return Boolean(env.GEOCODER_API_KEY && env.GEOCODER_API_KEY !== "replace-with-geoapify-key");
}

/** Case and whitespace variants of one query share a cache entry. */
export function normalizeGeocodeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

async function cacheKey(env: Env, query: string, limit: number): Promise<string> {
  const keyHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.GEOCODER_ORIGIN}|geoapify-v1|${normalizeGeocodeQuery(query)}|${limit}`));
  return `geocode/${Array.from(new Uint8Array(keyHash)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}.json`;
}

function jsonHeaders(maxAge: number, cache: string): Headers {
  return new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${maxAge}`, "x-topostack-cache": cache });
}

export async function geocodeResponse(request: Request, env: Env, ctx: ExecutionContext, url: URL, bypassCache = false): Promise<Response> {
  const query = (url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  const limit = geocodeLimit(url.searchParams.get("limit"));
  if (query.length < 2) return json({ error: "Query must contain at least two characters." }, { status: 400 });
  const key = await cacheKey(env, query, limit);
  const cached = bypassCache ? null : await readCache(env.MAP_CACHE, key, "geocoder");
  const ageSeconds = cached ? Math.max(0, (Date.now() - cached.uploaded.getTime()) / 1000) : Infinity;
  // Entries of "[]" predate the empty-result policy and are refreshed.
  if (cached && ageSeconds < GEOCODE_CACHE_SECONDS && cached.size > 2) {
    return new Response(cached.body, { headers: jsonHeaders(Math.max(0, Math.floor(GEOCODE_CACHE_SECONDS - ageSeconds)), "HIT") });
  }
  if (cached) await cached.body.cancel();

  const apiKey = env.GEOCODER_API_KEY;
  if (!apiKey || !isGeocoderConfigured(env)) return json({ error: "Geocoder is not configured." }, { status: 503 });
  const perClient = await env.GEOCODE_LIMITER.limit({ key: `${clientKey(request)}:geocode` });
  if (!perClient.success) return rateLimitExceeded("Place-search rate limit exceeded. Try again shortly.");
  const global = await env.GEOCODE_GLOBAL_LIMITER.limit({ key: GEOCODE_GLOBAL_LIMIT_KEY });
  if (!global.success) {
    console.warn(JSON.stringify({ message: "geocode_global_budget_exceeded" }));
    return rateLimitExceeded("Place search is busy. Try again shortly.");
  }
  const upstreamUrl = new URL("/v1/geocode/search", env.GEOCODER_ORIGIN);
  upstreamUrl.searchParams.set("text", query);
  upstreamUrl.searchParams.set("limit", String(limit));
  upstreamUrl.searchParams.set("format", "json");
  upstreamUrl.searchParams.set("apiKey", apiKey);
  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { headers: { "accept": "application/json" }, signal: upstreamSignal(request) });
  } catch (error) {
    return upstreamFailure(error, "Geocoder");
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    return json({ error: "Geocoder unavailable", status: upstream.status }, { status: 502 });
  }
  const contentLength = Number(upstream.headers.get("content-length") ?? 0);
  if (contentLength > MAX_GEOCODER_BYTES) {
    await upstream.body?.cancel();
    return json({ error: "Geocoder response too large" }, { status: 502 });
  }
  let body: Uint8Array;
  try { body = await readBounded(upstream.body, MAX_GEOCODER_BYTES); }
  catch (error) {
    if (error instanceof BodyTooLargeError) return json({ error: "Geocoder response too large" }, { status: 502 });
    return upstreamFailure(error, "Geocoder");
  }
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(body)); } catch { return json({ error: "Geocoder returned invalid JSON" }, { status: 502 }); }
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { results?: unknown }).results)) {
    return json({ error: "Geocoder returned an unexpected response" }, { status: 502 });
  }
  const normalized = normalizeGeoapify(payload);
  const normalizedBody = JSON.stringify(normalized);
  const cacheLabel = bypassCache ? "BYPASS" : "MISS";
  if (normalized.length === 0) return new Response(normalizedBody, { headers: jsonHeaders(EMPTY_GEOCODE_CACHE_SECONDS, cacheLabel) });
  if (!bypassCache) writeCache(ctx, "geocoder", () => env.MAP_CACHE.put(key, normalizedBody, { httpMetadata: { contentType: "application/json", cacheControl: `public, max-age=${GEOCODE_CACHE_SECONDS}` } }));
  return new Response(normalizedBody, { headers: jsonHeaders(GEOCODE_CACHE_SECONDS, cacheLabel) });
}
