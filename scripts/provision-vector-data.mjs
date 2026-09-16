import { cloudflareClient } from "./lib/cloudflare-client.mjs";
import { provisionVerifiedArchives } from "./lib/archive-provisioning.mjs";
import { access, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { processRunner } from "./lib/process.mjs";

const DATASET_SNAPSHOT = "20260905";
const EXPECTED_MAX_ZOOM = 12;
const OBJECT_KEY = "osm/current.pmtiles";
const DEVELOPMENT_BUCKET = "topostack-vector-data-development";
const PRODUCTION_BUCKET = "topostack-vector-data";

const flags = process.argv.slice(2).filter((argument) => argument.startsWith("--"));
const archivePath = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const includeProduction = flags.includes("--prod");
const skipDigestCheck = flags.includes("--skip-digest-check");
const expectedDigest = (flags.find((flag) => flag.startsWith("--expected-sha256="))?.slice("--expected-sha256=".length)
  ?? process.env.EXPECTED_ARCHIVE_SHA256 ?? "").trim().toLowerCase();
if (!archivePath || !flags.includes("--provision")) {
  throw new Error("Usage: node scripts/provision-vector-data.mjs <archive.pmtiles> --provision [--prod] [--promote] [--expected-sha256=<hex> | EXPECTED_ARCHIVE_SHA256=<hex>] [--skip-digest-check]");
}
if (includeProduction && !expectedDigest) throw new Error("Production provisioning requires a pinned SHA-256 digest; --skip-digest-check is development-only.");
if (skipDigestCheck && expectedDigest) throw new Error("Choose either a pinned SHA-256 digest or --skip-digest-check, not both.");
if (expectedDigest && !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error("The expected SHA-256 digest must contain exactly 64 hexadecimal characters.");
// Stage in development by default. Production staging and activation are explicit.
const buckets = includeProduction ? [DEVELOPMENT_BUCKET, PRODUCTION_BUCKET] : [DEVELOPMENT_BUCKET];

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const pmtilesBin = process.env.PMTILES_BIN ?? "pmtiles";
if (!accountId || !apiToken) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
const childBaseEnv = { ...process.env };
delete childBaseEnv.CLOUDFLARE_API_TOKEN;

await access(archivePath);
const archive = await stat(archivePath);
if (!archive.isFile()) throw new Error(`${archivePath} is not a file.`);

const { run, capture } = processRunner(childBaseEnv);

const cloudflare = cloudflareClient(accountId, apiToken);

console.log(`Verifying ${archivePath} (${(archive.size / 1_000_000_000).toFixed(2)} GB).`);
const hash = createHash("sha256");
await pipeline(createReadStream(archivePath), hash);
const archiveDigest = hash.digest("hex");
console.log(`Archive SHA-256: ${archiveDigest}`);
if (expectedDigest) {
  if (archiveDigest !== expectedDigest) throw new Error(`Archive digest mismatch: expected ${expectedDigest}, computed ${archiveDigest}. Refusing to upload.`);
  console.log("Archive digest matches the pinned SHA-256.");
} else if (skipDigestCheck) {
  console.warn("Digest pin check skipped (--skip-digest-check). Record the SHA-256 above and pin it for future runs.");
} else {
  throw new Error("No pinned digest provided. Pass --expected-sha256=<hex> (or set EXPECTED_ARCHIVE_SHA256), or use --skip-digest-check for a first-time pin capture.");
}
await run(pmtilesBin, ["verify", archivePath]);
const header = JSON.parse(await capture(pmtilesBin, ["show", archivePath, "--header-json"]));
if (header.minzoom !== 0 || header.maxzoom !== EXPECTED_MAX_ZOOM) {
  throw new Error(`Expected a global zoom 0-${EXPECTED_MAX_ZOOM} archive; received zoom ${header.minzoom}-${header.maxzoom}.`);
}

// Staging is the default. --promote changes a small release pointer only after
// the uploaded object's entire SHA-256 and size have been verified remotely.
const receiptPath = `${archivePath}.provisioning.json`;
const receipt = { schemaVersion: 2, dataset: DATASET_SNAPSHOT, key: OBJECT_KEY, buckets,
  sha256: archiveDigest, bytes: archive.size, maxZoom: EXPECTED_MAX_ZOOM, releases: [] };
await provisionVerifiedArchives({ accountId, cloudflare, buckets, logicalKey: OBJECT_KEY,
  dataset: DATASET_SNAPSHOT, archivePath, sha256: archiveDigest, bytes: archive.size, pmtilesBin, run,
  promote: flags.includes("--promote"),
  checkpoint: async (entry) => {
    receipt.releases = [...receipt.releases.filter((item) => item.bucket !== entry.bucket), entry];
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  },
});
console.log(`Verified ${OBJECT_KEY}. ${flags.includes("--promote") ? "Release pointer promoted." : "Staged only; rerun with --promote to activate after the gateway supports release pointers."} Receipt: ${receiptPath}`);
