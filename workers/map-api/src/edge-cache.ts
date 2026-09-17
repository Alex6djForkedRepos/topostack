// The Cache API is free and local to each Cloudflare location, so a hit costs
// no R2 operation. It sits in front of R2, never replaces it: entries can be
// evicted at any time, and failures degrade to an R2 read.

/**
 * Keys live under `/v1/__edge/` on the request's own origin. That path runs the
 * Worker first (wrangler `run_worker_first`), where it matches no route, so no
 * public request can be answered straight from these entries.
 */
export function edgeCacheKey(request: Request, path: string): string {
  return new URL(`/v1/__edge/${path}`, request.url).toString();
}

let enabled = true;

/** Test hook: the Cache API persists across tests, so suites opt in explicitly. */
export function setEdgeCacheEnabled(value: boolean): void {
  enabled = value;
}

function edgeCache(): Cache | null {
  if (!enabled || typeof caches === "undefined") return null;
  // The DOM lib's CacheStorage (tsconfig.base) hides the Workers-only `default`.
  return (caches as unknown as { default: Cache }).default;
}

export async function matchEdge(key: string): Promise<Response | null> {
  try {
    return (await edgeCache()?.match(key)) ?? null;
  } catch {
    console.warn(JSON.stringify({ message: "edge_cache_failed", operation: "read" }));
    return null;
  }
}

/** The response's own Cache-Control sets its lifetime in the edge cache. */
export function putEdge(ctx: ExecutionContext, key: string, response: Response): void {
  const cache = edgeCache();
  if (!cache) { void response.body?.cancel(); return; }
  ctx.waitUntil(cache.put(key, response).catch(() => {
    console.warn(JSON.stringify({ message: "edge_cache_failed", operation: "write" }));
  }));
}

/**
 * Splits a body between the client and the edge cache. The cached copy is
 * stored without per-request headers; readers rebuild those.
 */
export function teeToEdge(ctx: ExecutionContext, key: string, body: ReadableStream, headers: HeadersInit): ReadableStream {
  const [client, cached] = body.tee();
  putEdge(ctx, key, new Response(cached, { headers }));
  return client;
}
