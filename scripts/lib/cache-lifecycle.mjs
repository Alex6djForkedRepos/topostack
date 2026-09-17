import { createHash } from "node:crypto";

export const GEOCODE_EXPIRY_RULE = {
  id: "topostack-geocode-expire-2d", enabled: true, conditions: { prefix: "geocode/" },
  deleteObjectsTransition: { condition: { type: "Age", maxAge: 172800 } },
};

export const RETIRED_TERRAIN_RULE_ID_PREFIX = "topostack-terrain-retired-";
// R2 evaluates Age in whole days. Retired tiles were uploaded long before the
// version bump, so they qualify on the next lifecycle pass; the day guards
// only objects a straggling old deployment writes after retirement.
export const RETIRED_TERRAIN_MAX_AGE_SECONDS = 86400;
const DATASET_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/;

function assertDatasetVersion(version) {
  if (typeof version !== "string" || !DATASET_VERSION_PATTERN.test(version)) throw new Error(`Unexpected terrain dataset version: ${JSON.stringify(version)}`);
}

/** Terrain cache keys are `terrain/<DATASET_VERSION>/terrarium/z/x/y.png`; one rule expires one retired version. */
export function retiredTerrainRule(version) {
  assertDatasetVersion(version);
  return {
    id: RETIRED_TERRAIN_RULE_ID_PREFIX + createHash("sha256").update(version).digest("hex").slice(0, 16),
    enabled: true, conditions: { prefix: `terrain/${version}/` },
    deleteObjectsTransition: { condition: { type: "Age", maxAge: RETIRED_TERRAIN_MAX_AGE_SECONDS } },
  };
}

/** Versions found by listing `terrain/` with a `/` delimiter. */
export function terrainVersionsFromPrefixes(prefixes) {
  return prefixes.map((prefix) => {
    const match = /^terrain\/([^/]+)\/$/.exec(prefix);
    if (!match) throw new Error(`Unexpected terrain cache prefix: ${prefix}`);
    assertDatasetVersion(match[1]);
    return match[1];
  });
}

function retiredVersionOf(rule) {
  const match = /^terrain\/([^/]+)\/$/.exec(rule.conditions?.prefix ?? "");
  if (!match || rule.id !== retiredTerrainRule(match[1]).id) throw new Error(`Review managed terrain rule before reconciliation: ${rule.id}`);
  return match[1];
}

/**
 * Proposes the complete rule set: unrelated rules preserved, the geocoder expiry
 * present, and one expiry per retired terrain version. Protected versions (the
 * configured and the live deployment's) are never expired, and a managed rule
 * left over for a version that became current again is removed.
 */
export function reconcileCacheLifecycle(config, { retiredTerrainVersions = [], protectedTerrainVersions = [] } = {}) {
  if (!config || !Array.isArray(config.rules)) throw new Error("Unexpected R2 lifecycle configuration.");
  const protectedVersions = new Set(protectedTerrainVersions);
  for (const version of [...protectedVersions, ...retiredTerrainVersions]) assertDatasetVersion(version);
  const unrelated = [], retired = new Set();
  for (const rule of config.rules) {
    if (rule.id === GEOCODE_EXPIRY_RULE.id) continue;
    if (typeof rule.id === "string" && rule.id.startsWith(RETIRED_TERRAIN_RULE_ID_PREFIX)) { retired.add(retiredVersionOf(rule)); continue; }
    // Fail closed on broad pre-existing deletion rules; never quietly retain a
    // rule that could erase active terrain data or a provisioning bucket.
    if (rule.enabled && rule.deleteObjectsTransition && !rule.conditions?.prefix?.startsWith("geocode/")) {
      throw new Error(`Review existing deletion rule before reconciliation: ${rule.id}`);
    }
    unrelated.push(rule);
  }
  for (const version of retiredTerrainVersions) {
    if (protectedVersions.has(version)) throw new Error(`Refusing to expire the protected terrain version ${version}.`);
    retired.add(version);
  }
  const terrainRules = [...retired].filter((version) => !protectedVersions.has(version)).sort().map(retiredTerrainRule);
  return { rules: [...unrelated, structuredClone(GEOCODE_EXPIRY_RULE), ...terrainRules] };
}

export function hasGeocodeExpiry(config) {
  return config.rules.some((rule) => rule.enabled && rule.conditions?.prefix === "geocode/"
    && rule.deleteObjectsTransition?.condition?.type === "Age" && rule.deleteObjectsTransition.condition.maxAge === 172800);
}

function retiredRuleIds(config) {
  return config.rules.filter((rule) => rule.enabled && rule.id?.startsWith(RETIRED_TERRAIN_RULE_ID_PREFIX)
    && rule.deleteObjectsTransition?.condition?.type === "Age" && rule.deleteObjectsTransition.condition.maxAge === RETIRED_TERRAIN_MAX_AGE_SECONDS
    && rule.conditions?.prefix === retiredTerrainRule(retiredVersionOf(rule)).conditions.prefix).map((rule) => rule.id).sort();
}

/** Rules this tool does not manage, which a full-set replace must preserve. */
function unrelatedRuleIds(config) {
  return config.rules.filter((rule) => rule.id !== GEOCODE_EXPIRY_RULE.id && !String(rule.id ?? "").startsWith(RETIRED_TERRAIN_RULE_ID_PREFIX))
    .map((rule) => String(rule.id ?? "")).sort();
}

/**
 * True when `current` already carries every managed rule in `proposed` and no
 * stale ones. Compares the managed rules semantically, because the API may
 * echo rules back with fields added or reordered.
 *
 * The unrelated rules are compared by id as well: the PUT replaces the whole
 * rule set, so a rule the API silently dropped (multipart-upload cleanup, for
 * example) must not be reported as "applied and verified".
 */
export function lifecycleSatisfies(current, proposed) {
  return hasGeocodeExpiry(current) && JSON.stringify(retiredRuleIds(current)) === JSON.stringify(retiredRuleIds(proposed))
    && current.rules.filter((rule) => rule.id?.startsWith(RETIRED_TERRAIN_RULE_ID_PREFIX)).length === retiredRuleIds(proposed).length
    && JSON.stringify(unrelatedRuleIds(current)) === JSON.stringify(unrelatedRuleIds(proposed));
}
