/**
 * Shared reads of a deployed gateway's JSON endpoints.
 *
 * Cloudflare answers an outage or a WAF block with an HTML error page, so
 * every caller must check the status and content type before parsing: calling
 * `response.json()` first turns a readable outage message into a SyntaxError.
 */

/** Validates an HTTPS origin (no credentials, path, query, or fragment). */
export function gatewayOrigin(value, label = "WORKER_URL") {
  if (!value) throw new Error(`${label} must be an HTTPS origin.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an HTTPS origin.`);
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
    throw new Error(`${label} must be an HTTPS origin.`);
  }
  return url;
}

/** GETs `path` from `origin` and parses it, failing loudly on an error page. */
export async function fetchGatewayJson(origin, path, request = fetch, { timeoutMs = 15_000 } = {}) {
  const url = new URL(path, origin);
  const response = await request(url, { signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !/^application\/(?:[\w.+-]+\+)?json\b/i.test(contentType.trim())) {
    await response.body?.cancel();
    throw new Error(`${url} did not return JSON: HTTP ${response.status}, content-type ${contentType || "(none)"}.`);
  }
  return await response.json();
}

/** The dataset version the live gateway is serving right now. */
export async function liveDatasetVersion(origin, request = fetch) {
  const manifest = await fetchGatewayJson(origin, "/v1/manifest", request).catch((error) => {
    throw new Error(`Could not read the live manifest at ${origin}: ${error.message}`);
  });
  const version = manifest.datasetVersion;
  if (typeof version !== "string" || !version) throw new Error(`The live manifest at ${origin} has no datasetVersion.`);
  return version;
}

/** Release-pointer promotion is only safe once the deployed gateway reads them. */
export async function verifyPromotionGateway(origin, request = fetch) {
  const manifest = await fetchGatewayJson(origin, "/v1/manifest", request).catch((error) => {
    throw new Error(`Deploy the release-aware gateway at ${origin} before promoting archives (${error.message}).`);
  });
  if (manifest.capabilities?.archiveReleases !== 1) throw new Error(`Deploy the release-aware gateway at ${origin} before promoting archives.`);
}
