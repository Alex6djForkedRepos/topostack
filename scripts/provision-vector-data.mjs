import { cloudflareClient } from "./lib/cloudflare-client.mjs";
import { assertDigestPinPolicy, parseArchiveFlags, provisionWithReceipt, statArchive, verifyArchiveDigest, verifyPmtilesHeader } from "./lib/archive-provisioning.mjs";
import { processRunner } from "./lib/process.mjs";

const DATASET_SNAPSHOT = "20260905";
const EXPECTED_MAX_ZOOM = 12;
const OBJECT_KEY = "osm/current.pmtiles";

const options = parseArchiveFlags(process.argv.slice(2));
const { flags, archivePath, buckets } = options;
if (!archivePath || !flags.includes("--provision")) {
  throw new Error("Usage: node scripts/provision-vector-data.mjs <archive.pmtiles> --provision [--prod] [--promote] [--expected-sha256=<hex> | EXPECTED_ARCHIVE_SHA256=<hex>] [--skip-digest-check]");
}
assertDigestPinPolicy(options);

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const pmtilesBin = process.env.PMTILES_BIN ?? "pmtiles";
if (!accountId || !apiToken) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
const childBaseEnv = { ...process.env };
delete childBaseEnv.CLOUDFLARE_API_TOKEN;

const archive = await statArchive(archivePath);

const { run, capture } = processRunner(childBaseEnv);

const cloudflare = cloudflareClient(accountId, apiToken);

console.log(`Verifying ${archivePath} (${(archive.size / 1_000_000_000).toFixed(2)} GB).`);
const archiveDigest = await verifyArchiveDigest(archivePath, options);
const header = await verifyPmtilesHeader({ run, capture, pmtilesBin, archivePath });
if (header.minzoom !== 0 || header.maxzoom !== EXPECTED_MAX_ZOOM) {
  throw new Error(`Expected a global zoom 0-${EXPECTED_MAX_ZOOM} archive; received zoom ${header.minzoom}-${header.maxzoom}.`);
}

// Staging is the default. --promote changes a small release pointer only after
// the uploaded object's entire SHA-256 and size have been verified remotely.
await provisionWithReceipt({ accountId, cloudflare, buckets, logicalKey: OBJECT_KEY,
  dataset: DATASET_SNAPSHOT, archivePath, sha256: archiveDigest, bytes: archive.size, maxZoom: EXPECTED_MAX_ZOOM,
  pmtilesBin, run, promote: options.promote });
