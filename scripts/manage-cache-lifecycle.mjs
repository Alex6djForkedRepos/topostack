import { writeFile } from "node:fs/promises";
import { cloudflareClient } from "./lib/cloudflare-client.mjs";
import { hasGeocodeExpiry, reconcileCacheLifecycle } from "./lib/cache-lifecycle.mjs";

const flags = process.argv.slice(2);
if (flags.some((flag) => !["--apply", "--prod"].includes(flag))) throw new Error("Usage: node --env-file=.env scripts/manage-cache-lifecycle.mjs [--apply] [--prod]");
const buckets = flags.includes("--prod") ? ["topostack-map-cache-development", "topostack-map-cache"] : ["topostack-map-cache-development"];
const api = cloudflareClient();
for (const bucket of buckets) {
  const path = `/r2/buckets/${bucket}/lifecycle`;
  const previous = await api(path);
  const proposed = reconcileCacheLifecycle(previous);
  const configured = hasGeocodeExpiry(previous);
  console.log(JSON.stringify({ bucket, configured, proposed }));
  if (flags.includes("--apply") && !configured) {
    const receiptPath = `/tmp/${bucket}-lifecycle-${Date.now()}.json`;
    await writeFile(receiptPath, JSON.stringify({ bucket, previous, proposed }, null, 2) + "\n", { mode: 0o600 });
    // The API replaces the full rule set and has no conditional-update option.
    // Recheck immediately before writing to catch changes since the audit.
    const current = await api(path);
    if (JSON.stringify(current) !== JSON.stringify(previous)) throw new Error("Lifecycle rules changed during review. Rerun the audit.");
    await api(path, { method: "PUT", body: JSON.stringify(proposed) });
    if (!hasGeocodeExpiry(await api(path))) throw new Error("R2 did not retain the expected expiry rule.");
    console.log(`Applied and verified expiry for ${bucket}. Previous rules: ${receiptPath}`);
  } else if (!configured) process.exitCode = 1;
}
