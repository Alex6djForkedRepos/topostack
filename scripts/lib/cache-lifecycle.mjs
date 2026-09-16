export const GEOCODE_EXPIRY_RULE = {
  id: "topostack-geocode-expire-2d", enabled: true, conditions: { prefix: "geocode/" },
  deleteObjectsTransition: { condition: { type: "Age", maxAge: 172800 } },
};

export function reconcileCacheLifecycle(config) {
  if (!config || !Array.isArray(config.rules)) throw new Error("Unexpected R2 lifecycle configuration.");
  // Fail closed on broad pre-existing deletion rules; never quietly retain a
  // rule that could erase active terrain data or a provisioning bucket.
  for (const rule of config.rules) {
    if (rule.id === GEOCODE_EXPIRY_RULE.id) continue;
    if (rule.enabled && rule.deleteObjectsTransition && !rule.conditions?.prefix?.startsWith("geocode/")) {
      throw new Error(`Review existing deletion rule before reconciliation: ${rule.id}`);
    }
  }
  return { rules: [...config.rules.filter((rule) => rule.id !== GEOCODE_EXPIRY_RULE.id), structuredClone(GEOCODE_EXPIRY_RULE)] };
}

export function hasGeocodeExpiry(config) {
  return config.rules.some((rule) => rule.enabled && rule.conditions?.prefix === "geocode/"
    && rule.deleteObjectsTransition?.condition?.type === "Age" && rule.deleteObjectsTransition.condition.maxAge === 172800);
}
