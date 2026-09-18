/**
 * Bridge between the worker's dataset constants and the wrangler config, which
 * cannot reference a module. Every DATASET_VERSION in wrangler.jsonc must equal
 * the one derived from the Protomaps snapshot; this check is what fails when a
 * basemap refresh updates only one of them.
 */
import { DATASET_VERSION, PROTOMAPS_SNAPSHOT } from "../../workers/map-api/src/dataset.ts";
import { readWranglerConfig } from "./r2-buckets.mjs";

export { DATASET_VERSION, PROTOMAPS_SNAPSHOT };

/** Every `vars.DATASET_VERSION` in the config that disagrees with the constant. */
export function datasetVersionDrift(config) {
  const entries = [["top-level", config.vars?.DATASET_VERSION], ...Object.entries(config.env ?? {}).map(([name, environment]) => [name, environment.vars?.DATASET_VERSION])];
  return entries.filter(([, version]) => version !== DATASET_VERSION).map(([name, version]) => `${name}: ${version ?? "missing"}`);
}

export async function assertDatasetVersionsAgree(config) {
  const drift = datasetVersionDrift(config ?? await readWranglerConfig());
  if (drift.length) {
    throw new Error(`wrangler.jsonc DATASET_VERSION must equal ${DATASET_VERSION} from workers/map-api/src/dataset.ts; found ${drift.join(", ")}. Update both when the Protomaps snapshot changes.`);
  }
  return DATASET_VERSION;
}
