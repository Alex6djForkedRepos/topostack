import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectOutlines, publishOutlines, releasePath } from "./lib/lake-outlines.mjs";
import { writeJsonAtomic } from "./lib/files.mjs";
import { cloudflareClient } from "./lib/cloudflare-client.mjs";
import { temporaryR2Client, verifyParentToken } from "./lib/r2-s3.mjs";

const args = process.argv.slice(2);
const mode = args.filter((arg) => ["--prepare", "--verify-only", "--provision"].includes(arg));
if (mode.length !== 1 || args.some((arg) => arg.startsWith("--") && ![...mode, "--prod"].includes(arg)) || args.filter((arg) => !arg.startsWith("--")).length > 1) {
  throw new Error("Usage: node --env-file-if-exists=.env scripts/provision-lake-outlines.mjs [directory] (--prepare | --verify-only | --provision) [--prod]");
}
const directory = args.find((arg) => !arg.startsWith("--")) ?? ".topostack/lake-outlines";
const { release, objects } = await inspectOutlines(directory);
if (mode[0] === "--prepare") {
  await writeJsonAtomic(fileURLToPath(releasePath), release);
  console.log(`Prepared release ${release.index.sha256}; publish before deploying this pin.`);
} else {
  assert.deepEqual(release, JSON.parse(await readFile(releasePath, "utf8")), "Generated outlines differ from the committed release pin. Prepare and review the new release first.");
  if (mode[0] === "--provision") {
    const bucket = args.includes("--prod") ? "topostack-vector-data" : "topostack-vector-data-development";
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const cloudflare = cloudflareClient();
    const parentAccessKeyId = await verifyParentToken(cloudflare);
    const { request } = await temporaryR2Client({ cloudflare, accountId, bucket, parentAccessKeyId,
      permission: "object-read-write", prefixes: ["lake-outlines/"], ttlSeconds: 3600 });
    let verified = 0;
    await publishOutlines(request, objects, () => { if (++verified % 50 === 0) console.log(`Verified ${verified}/${objects.length} objects in ${bucket}.`); });
    await writeJsonAtomic(`.topostack/lake-outlines-${bucket}.provisioning.json`, { bucket, release, verifiedAt: new Date().toISOString() });
    console.log(`Published and verified ${objects.length} objects in ${bucket}.`);
  } else console.log(`Verified ${release.providerOutlines} outlines in ${release.shards} shards against the release pin.`);
}
