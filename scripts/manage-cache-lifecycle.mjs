import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareClient } from "./lib/cloudflare-client.mjs";
import { hasGeocodeExpiry, reconcileCacheLifecycle } from "./lib/cache-lifecycle.mjs";

const flags = process.argv.slice(2);
if (flags.some((flag) => !["--apply", "--prod"].includes(flag))) throw new Error("Usage: node --env-file=.env scripts/manage-cache-lifecycle.mjs [--apply] [--prod]");
const buckets = flags.includes("--prod") ? ["topostack-map-cache-development", "topostack-map-cache"] : ["topostack-map-cache-development"];
const api = cloudflareClient();
// Rollback receipts must survive reboots and tmp cleaners, so keep them in a
// gitignored repo-local directory unless an explicit location is provided.
const receiptDirectory = process.env.LIFECYCLE_RECEIPT_DIR ?? fileURLToPath(new URL("../.topostack/receipts/", import.meta.url));
for (const bucket of buckets) {
  const path = `/r2/buckets/${bucket}/lifecycle`;
  const previous = await api(path);
  const proposed = reconcileCacheLifecycle(previous);
  const configured = hasGeocodeExpiry(previous);
  console.log(JSON.stringify({ bucket, configured, proposed }));
  if (flags.includes("--apply") && !configured) {
    await mkdir(receiptDirectory, { recursive: true, mode: 0o700 });
    const receiptPath = join(receiptDirectory, `${bucket}-lifecycle-${Date.now()}.json`);
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
