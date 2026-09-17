import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { cloudflareClient } from "./lib/cloudflare-client.mjs";
import { lifecycleSatisfies, reconcileCacheLifecycle, terrainVersionsFromPrefixes } from "./lib/cache-lifecycle.mjs";
import { receiptDirectory, writeJsonAtomic } from "./lib/files.mjs";
import { liveDatasetVersion } from "./lib/gateway.mjs";
import { bucketDeployment, configuredDatasetVersion, readWranglerConfig } from "./lib/r2-buckets.mjs";
import { temporaryR2Client, verifyParentToken } from "./lib/r2-s3.mjs";

const flags = process.argv.slice(2);
if (flags.some((flag) => !["--apply", "--prod"].includes(flag))) throw new Error("Usage: node --env-file=.env scripts/manage-cache-lifecycle.mjs [--apply] [--prod]");
const buckets = flags.includes("--prod") ? ["topostack-map-cache-development", "topostack-map-cache"] : ["topostack-map-cache-development"];
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const api = cloudflareClient(accountId);
const wrangler = await readWranglerConfig();
const parentAccessKeyId = await verifyParentToken(api);
const receipts = receiptDirectory();
for (const bucket of buckets) {
  const { environment, origin } = bucketDeployment(bucket);
  // Protect both the version about to deploy and the one serving traffic now:
  // between a DATASET_VERSION bump and its deploy they differ, and either may
  // be the live cache. An unreachable gateway aborts instead of guessing.
  const protectedTerrainVersions = [...new Set([configuredDatasetVersion(wrangler, environment), await liveDatasetVersion(origin)])];
  const { list } = await temporaryR2Client({ cloudflare: api, accountId, bucket, parentAccessKeyId, permission: "object-read-only", ttlSeconds: 900 });
  const stored = terrainVersionsFromPrefixes((await list({ prefix: "terrain/", delimiter: "/" })).prefixes);
  const retiredTerrainVersions = stored.filter((version) => !protectedTerrainVersions.includes(version));
  const path = `/r2/buckets/${bucket}/lifecycle`;
  const previous = await api(path);
  const proposed = reconcileCacheLifecycle(previous, { retiredTerrainVersions, protectedTerrainVersions });
  const configured = lifecycleSatisfies(previous, proposed);
  console.log(JSON.stringify({ bucket, configured, protectedTerrainVersions, retiredTerrainVersions, proposed }));
  if (flags.includes("--apply") && !configured) {
    await mkdir(receipts, { recursive: true, mode: 0o700 });
    const receiptPath = join(receipts, `${bucket}-lifecycle-${Date.now()}.json`);
    // A truncated rollback receipt is worse than none: write it atomically.
    await writeJsonAtomic(receiptPath, { bucket, previous, proposed }, { mode: 0o600 });
    // The API replaces the full rule set and has no conditional-update option.
    // Recheck immediately before writing to catch changes since the audit.
    const current = await api(path);
    if (JSON.stringify(current) !== JSON.stringify(previous)) throw new Error("Lifecycle rules changed during review. Rerun the audit.");
    await api(path, { method: "PUT", body: JSON.stringify(proposed) });
    if (!lifecycleSatisfies(await api(path), proposed)) throw new Error("R2 did not retain the expected lifecycle rules.");
    console.log(`Applied and verified lifecycle rules for ${bucket}. Previous rules: ${receiptPath}`);
  } else if (!configured) process.exitCode = 1;
}
