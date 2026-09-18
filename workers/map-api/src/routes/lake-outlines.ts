import release from "../../../../scripts/data/lake-outlines-release.json";

import { edgeCacheKey, matchEdge, teeToEdge } from "../edge-cache";
import { etagMatches, json } from "../http";

export const OUTLINE_PATH = /^\/v1\/lake-outlines\/([a-f0-9]{24}|[a-f0-9]{64})\.json$/;
export const OUTLINE_INDEX_FILE = release.index.file;
export const OUTLINE_INDEX_KEY = `lake-outlines/${release.index.file}`;
const MAX_BYTES = 5_000_000;

export async function outlineReadiness(bucket: R2Bucket): Promise<boolean> {
  const head = await bucket.head(OUTLINE_INDEX_KEY);
  return head?.size === release.index.bytes && head.customMetadata?.sha256 === release.index.sha256;
}

/** Content-addressed URLs remain valid across app releases; no mutable latest pointer. */
export async function outlineResponse(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const match = OUTLINE_PATH.exec(new URL(request.url).pathname);
  if (!match) return json({ error: "Invalid outline path." }, { status: 404, headers: { "cache-control": "no-store" } });
  const key = `lake-outlines/${match[1]}.json`;
  const edgeKey = edgeCacheKey(request, key);
  const cached = await matchEdge(edgeKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    headers.set("x-topostack-cache", "EDGE");
    if (etagMatches(request.headers.get("if-none-match"), headers.get("etag") ?? "")) {
      await cached.body?.cancel();
      return new Response(null, { status: 304, headers });
    }
    if (request.method === "HEAD") { await cached.body?.cancel(); return new Response(null, { headers }); }
    return new Response(cached.body, { headers });
  }
  const object = request.method === "HEAD" ? await env.VECTOR_DATA.head(key) : await env.VECTOR_DATA.get(key, {
    onlyIf: request.headers.has("if-none-match") ? new Headers({ "if-none-match": request.headers.get("if-none-match")! }) : undefined,
  });
  if (!object) return json({ error: "Lake outlines have not been provisioned." }, { status: 404, headers: { "cache-control": "no-store" } });
  const sha256 = object.customMetadata?.sha256;
  if (object.size >= MAX_BYTES || !sha256 || !/^[a-f0-9]{64}$/.test(sha256) || !sha256.startsWith(match[1]!)) {
    if ("body" in object) await (object as R2ObjectBody).body.cancel();
    return json({ error: "Invalid lake outline object." }, { status: 503, headers: { "cache-control": "no-store" } });
  }
  const headers = new Headers({ "content-type": "application/json", "content-length": String(object.size),
    "cache-control": "public, max-age=31536000, immutable", "etag": object.httpEtag,
    "x-content-type-options": "nosniff", "x-topostack-cache": "R2" });
  if (etagMatches(request.headers.get("if-none-match"), object.httpEtag)) {
    if ("body" in object) await (object as R2ObjectBody).body.cancel();
    return new Response(null, { status: 304, headers });
  }
  if (request.method === "HEAD") return new Response(null, { headers });
  if (!("body" in object)) return new Response(null, { status: 412, headers: { "cache-control": "no-store" } });
  return new Response(teeToEdge(ctx, edgeKey, (object as R2ObjectBody).body, headers), { headers });
}
