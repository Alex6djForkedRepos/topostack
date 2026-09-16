const UPSTREAM_TIMEOUT_MS = 10_000;
const DEFAULT_ALLOWED_ORIGIN_SUFFIXES = ".atomm.com";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function json(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(value), { ...init, headers });
}

export interface OriginPolicyEnv {
  ALLOWED_ORIGINS: string;
  // Comma-separated host suffixes allowed over HTTPS (default ".atomm.com").
  // Set to an empty string to disable suffix-based origins entirely.
  ALLOWED_ORIGIN_SUFFIXES?: string;
  ENVIRONMENT?: string;
}

// The local dev server moves to another port whenever its default is taken, so
// pinning exact loopback origins would break `npm run dev` at the first
// collision. Only the development Worker accepts a floating port this way;
// staging and production keep the exact ALLOWED_ORIGINS list.
function isDevelopmentLoopbackOrigin(origin: string, env: OriginPolicyEnv): boolean {
  if (env.ENVIRONMENT !== "development") return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

// CORS is a browser policy, not access control: requests without an Origin
// (curl, servers) are always allowed. Upstream-cost routes rely on rate limits.
export function isAllowedOrigin(origin: string | null, env: OriginPolicyEnv): boolean {
  if (!origin) return true;
  if (env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).includes(origin)) return true;
  if (isDevelopmentLoopbackOrigin(origin, env)) return true;
  if (!origin.startsWith("https://")) return false;
  const suffixes = (env.ALLOWED_ORIGIN_SUFFIXES ?? DEFAULT_ALLOWED_ORIGIN_SUFFIXES)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    // A leading dot keeps the label boundary: ".atomm.com" matches
    // https://runtime.atomm.com but not https://evil-atomm.com.
    .map((suffix) => (suffix.startsWith(".") ? suffix : `.${suffix}`));
  return suffixes.some((suffix) => origin.endsWith(suffix));
}

export function corsHeaders(request: Request, env: Env): Headers {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "access-control-allow-methods": new URL(request.url).pathname === "/v1/events" ? "POST,OPTIONS" : "GET,HEAD,OPTIONS",
    "access-control-allow-headers": "range,content-type,if-none-match",
    "access-control-expose-headers": "content-length,content-range,etag,x-topostack-dataset,x-topostack-cache,x-topostack-imagery-sources,x-topostack-r2-reads",
    "access-control-max-age": "86400",
    "vary": "Origin",
  });
  if (origin && isAllowedOrigin(origin, env)) headers.set("access-control-allow-origin", origin);
  return headers;
}

export function withCors(response: Response, request: Request, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of corsHeaders(request, env)) headers.set(name, value);
  headers.set("content-security-policy", "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  headers.set("cross-origin-resource-policy", "cross-origin");
  headers.set("permissions-policy", "camera=(), geolocation=(), microphone=(), payment=(), usb=()");
  headers.set("referrer-policy", "no-referrer");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  if (response.status >= 400) headers.set("cache-control", "no-store");
  if (request.method === "HEAD") {
    void response.body?.cancel().catch(() => {});
    return new Response(null, { status: response.status, statusText: response.statusText, headers });
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function upstreamSignal(request: Request): AbortSignal {
  return AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]);
}

export function upstreamFailure(error: unknown, service: string): Response {
  const timedOut = error instanceof DOMException && error.name === "TimeoutError";
  console.warn(JSON.stringify({ message: "upstream_failed", service, reason: timedOut ? "timeout" : "network" }));
  return json({ error: timedOut ? `${service} timed out` : `${service} unavailable` }, { status: timedOut ? 504 : 502 });
}

export function clientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "anonymous";
}

export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const normalize = (value: string) => value.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((candidate) => normalize(candidate) === normalize(etag));
}

export function rateLimitExceeded(message = "Rate limit exceeded. Try again shortly."): Response {
  return json({ error: message }, { status: 429, headers: { "retry-after": "60", "cache-control": "no-store" } });
}
