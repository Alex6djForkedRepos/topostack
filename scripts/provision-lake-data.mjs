import { cloudflareClient } from "./lib/cloudflare-client.mjs";
import { provisionVerifiedArchives } from "./lib/archive-provisioning.mjs";
/**
 * Upload registered lake bathymetry or additional terrain archives.
 *
 * Uses the same staged upload, full remote verification, and conditional
 * release-pointer promotion as provision-vector-data.mjs.
 */
import { access, stat, writeFile, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { processRunner } from "./lib/process.mjs";
import { validateTerrainPublication, validateTerrainRegistrySnapshot } from "./lib/terrain-publication.mjs";

import { validateSurveyCatalog, validateTerrainCatalog } from "../packages/core/src/source-catalog.ts";
const catalogArgument = process.argv.find((argument) => argument.startsWith("--terrain-catalog="))?.slice("--terrain-catalog=".length);
const terrainCatalogUrl = catalogArgument ? pathToFileURL(resolve(catalogArgument)) : new URL("./data/terrain-sources.json", import.meta.url);
const rawTerrainCatalog = JSON.parse(await readFile(terrainCatalogUrl, "utf8"));
if (rawTerrainCatalog.registryVersion !== undefined) {
  if (!/^terrain-releases\/[a-f0-9]{64}\.json$/.test(rawTerrainCatalog.releaseManifest ?? "")) throw new Error("Invalid terrain manifest reference.");
  validateTerrainRegistrySnapshot(rawTerrainCatalog, await readFile(new URL(rawTerrainCatalog.releaseManifest, terrainCatalogUrl)));
}
const terrainCatalog = validateTerrainCatalog(rawTerrainCatalog);

const catalog = validateSurveyCatalog(JSON.parse(await readFile(new URL("./data/lake-bathymetry.json", import.meta.url), "utf8")));
const sourceFlag = process.argv.find((argument) => argument.startsWith("--source="))?.slice(9) ?? "globathy";
const sourceId = sourceFlag === "noaa" ? "noaa-great-lakes-v1" : sourceFlag;
const terrain = terrainCatalog.sources.find((source) => source.id === sourceId);
const raster = terrain ?? catalog.sources.find((source) => source.id === sourceId);
if (!raster && sourceId !== "globathy") throw new Error("Unknown source; use globathy, noaa, or an ID from scripts/data/lake-bathymetry.json or terrain-sources.json.");
const DATASET_SNAPSHOT = raster?.id ?? "hydrolakes-v10+globathy-2022";
const EXPECTED_MAX_ZOOM = raster?.maxZoom ?? 12;
const OBJECT_KEY = terrain ? `terrain-sources/${terrain.id}.pmtiles` : raster ? `bathymetry/${raster.id}.pmtiles` : "lakes/current.pmtiles";
const DEVELOPMENT_BUCKET = "topostack-vector-data-development";
const PRODUCTION_BUCKET = "topostack-vector-data";

const flags = process.argv.slice(2).filter((argument) => argument.startsWith("--"));
const archivePath = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const verifyOnly = flags.includes("--verify-only");
if (verifyOnly && (flags.includes("--provision") || flags.includes("--promote") || flags.includes("--prod"))) throw new Error("--verify-only cannot be combined with publication flags.");
const includeProduction = flags.includes("--prod");
const skipDigestCheck = flags.includes("--skip-digest-check");
const expectedDigest = (flags.find((flag) => flag.startsWith("--expected-sha256="))?.slice("--expected-sha256=".length)
  ?? process.env.EXPECTED_ARCHIVE_SHA256 ?? "").trim().toLowerCase();
if (!archivePath || (!verifyOnly && !flags.includes("--provision"))) {
  throw new Error("Usage: node scripts/provision-lake-data.mjs <archive.pmtiles> (--provision | --verify-only) [--source=globathy|noaa|<dataset-id>] [--prod] [--promote] [--expected-sha256=<hex> | EXPECTED_ARCHIVE_SHA256=<hex>] [--skip-digest-check]");
}
if (includeProduction && !expectedDigest) throw new Error("Production provisioning requires a pinned SHA-256 digest; --skip-digest-check is development-only.");
if (skipDigestCheck && expectedDigest) throw new Error("Choose either a pinned SHA-256 digest or --skip-digest-check, not both.");
if (expectedDigest && !/^[a-f0-9]{64}$/.test(expectedDigest)) throw new Error("The expected SHA-256 digest must contain exactly 64 hexadecimal characters.");
// Stage in development by default. Production staging and activation are explicit.
const buckets = includeProduction ? [DEVELOPMENT_BUCKET, PRODUCTION_BUCKET] : [DEVELOPMENT_BUCKET];

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const pmtilesBin = process.env.PMTILES_BIN ?? "pmtiles";
if (!verifyOnly && (!accountId || !apiToken)) throw new Error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.");
const childBaseEnv = { ...process.env };
delete childBaseEnv.CLOUDFLARE_API_TOKEN;

await access(archivePath);
const archive = await stat(archivePath);
if (!archive.isFile()) throw new Error(`${archivePath} is not a file.`);

const { run, capture } = processRunner(childBaseEnv);



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
if ((!raster && header.minzoom !== 0) || !Number.isInteger(header.minzoom) || header.minzoom < 0 || header.minzoom > (terrain?.minZoom ?? EXPECTED_MAX_ZOOM) || header.maxzoom !== EXPECTED_MAX_ZOOM) {
  throw new Error(`Expected a zoom 0-${EXPECTED_MAX_ZOOM} archive; received zoom ${header.minzoom}-${header.maxzoom}.`);
}

if (raster) {
  const metadata = JSON.parse(await capture(pmtilesBin, ["show", archivePath, "--metadata"]));
  if (header.tile_type !== "png" || metadata.topostack_dataset !== DATASET_SNAPSHOT || metadata.topostack_encoding !== raster.encoding || (terrain && metadata.topostack_vertical_datum !== terrain.verticalDatum)) {
    throw new Error("Expected the registered numeric PNG archive. Refusing to upload a different dataset.");
  }
  if (terrain) {
    const legacyBuilds = JSON.parse(await readFile(new URL("./data/hrdem-builds.json", import.meta.url), "utf8")).builds;
    const legacyPins = JSON.parse(await readFile(new URL("./data/hrdem-sources.json", import.meta.url), "utf8"));
    const record = rawTerrainCatalog.records?.[terrain.id];
    const legacyReceipt = legacyBuilds.find((entry) => entry.dataset === terrain.id);
    const buildReceipt = record?.receipt ?? legacyReceipt;
    validateTerrainPublication({ source: terrain, header, metadata, receipt: buildReceipt,
      sha256: archiveDigest, bytes: archive.size, pin: record?.pin ?? legacyPins[terrain.id],
      legacy: legacyReceipt?.sha256 === archiveDigest });
  }
}

if (verifyOnly) {
  console.log("Verified locally: archive hash, format, registration and build receipt. No remote changes.");
  process.exit(0);
}
const cloudflare = cloudflareClient(accountId, apiToken);

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
