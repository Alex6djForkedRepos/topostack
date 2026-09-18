import { pathToFileURL } from "node:url";
import { DEVELOPMENT_ORIGIN, PRODUCTION_ORIGIN } from "./lib/r2-buckets.mjs";

// TopoStack moved from echofoxtrot.works to topostack.app. The legacy hosts
// stay attached to the Worker so published Atomm packages keep reaching the
// API there (CORS preflights cannot follow a redirect). Every other request on
// a legacy host is permanently redirected to the same path on the canonical
// origin by a Single Redirect rule, which runs before the Worker and its
// static assets.
export const LEGACY_ZONE = "echofoxtrot.works";
export const LEGACY_HOSTS = Object.freeze({
  "topostack.echofoxtrot.works": PRODUCTION_ORIGIN,
  "dev-topostack.echofoxtrot.works": DEVELOPMENT_ORIGIN,
});
const PHASE = "http_request_dynamic_redirect";
const REF_PREFIX = "topostack_legacy_";
// Mirrors run_worker_first in workers/map-api/wrangler.jsonc: these paths are
// served in place on the legacy host instead of redirected.
const API_EXCLUSION = 'not http.request.uri.path in {"/health" "/ready" "/v1"}'
  + ' and not starts_with(http.request.uri.path, "/v1/")'
  + ' and not starts_with(http.request.uri.path, "/data/lake-outlines/")';

export function legacyRedirectRules() {
  return Object.entries(LEGACY_HOSTS).map(([host, origin]) => ({
    ref: REF_PREFIX + host.replaceAll(/[^a-z0-9]/g, "_"),
    description: `TopoStack: redirect ${host} to ${new URL(origin).host}`,
    expression: `(http.host eq "${host}" and ${API_EXCLUSION})`,
    action: "redirect",
    action_parameters: {
      from_value: {
        status_code: 301,
        target_url: { expression: `concat("${origin}", http.request.uri.path)` },
        preserve_query_string: true,
      },
    },
    enabled: true,
  }));
}

/** Replaces this script's rules and keeps every other rule in the zone's redirect phase untouched. */
export function mergeRedirectRules(existing = []) {
  const kept = existing
    .filter((rule) => !rule.ref?.startsWith(REF_PREFIX))
    .map(({ id, ref, description, expression, action, action_parameters, enabled }) => ({ id, ref, description, expression, action, action_parameters, enabled }));
  return [...kept, ...legacyRedirectRules()];
}

async function cloudflare(path, token, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("Set CLOUDFLARE_API_TOKEN (Zone Read and Single Redirect Edit on " + LEGACY_ZONE + ").");
  const zones = await cloudflare(`/zones?name=${LEGACY_ZONE}`, token);
  const zoneId = zones.body.result?.[0]?.id;
  if (!zoneId) throw new Error(`Zone ${LEGACY_ZONE} is not visible to this token: ${JSON.stringify(zones.body.errors)}`);
  const entrypoint = await cloudflare(`/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`, token);
  if (entrypoint.status !== 200 && entrypoint.status !== 404) throw new Error(`Reading redirect rules failed: ${JSON.stringify(entrypoint.body.errors)}`);
  const rules = mergeRedirectRules(entrypoint.status === 200 ? entrypoint.body.result.rules : []);
  if (!apply) {
    console.log(JSON.stringify(rules, null, 2));
    console.log(`Dry run: ${rules.length} rule(s) for ${LEGACY_ZONE}. Re-run with --apply to write them.`);
    return;
  }
  const written = await cloudflare(`/zones/${zoneId}/rulesets/phases/${PHASE}/entrypoint`, token, { method: "PUT", body: JSON.stringify({ rules }) });
  if (!written.body.success) throw new Error(`Writing redirect rules failed: ${JSON.stringify(written.body.errors)}`);
  console.log(`Applied ${legacyRedirectRules().length} TopoStack legacy redirect rule(s) to ${LEGACY_ZONE}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
