/**
 * The one place the basemap snapshot is written down.
 *
 * The Protomaps build date appears in the manifest the client reads, in the
 * DATASET_VERSION that keys every terrain cache entry, and in the provisioning
 * script that uploads the archive. wrangler.jsonc cannot reference a module,
 * so its DATASET_VERSION strings are checked against DATASET_VERSION by
 * `npm run version:check` and by scripts/test/versions.test.mjs.
 */
export const PROTOMAPS_SNAPSHOT = "20260905";
export const PROTOMAPS_BASEMAP_VERSION = "4.15.2";
export const VECTOR_MAX_ZOOM = 12;

/** Must equal every `vars.DATASET_VERSION` in workers/map-api/wrangler.jsonc. */
export const DATASET_VERSION = `mapzen-terrarium+protomaps-${PROTOMAPS_SNAPSHOT}-z${VECTOR_MAX_ZOOM}-v1`;
