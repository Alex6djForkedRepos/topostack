import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inspectPreviews, pinPath, publishPreviews } from "../lib/lake-previews.mjs";
import { writeJsonAtomic } from "../lib/files.mjs";
import { cloudflareClient } from "../lib/cloudflare-client.mjs";
import { temporaryR2Client, verifyParentToken } from "../lib/r2-s3.mjs";

// Publishes rendered lake depth previews. Order: --prepare writes the pin for
// review; --provision uploads to the development bucket, then --provision --prod
// to production, both before the pin is merged, so no page references a
// preview that is not there.
const args = process.argv.slice(2);
const mode = args.filter((arg) => ["--prepare", "--verify-only", "--provision"].includes(arg));
if (mode.length !== 1 || args.some((arg) => arg.startsWith("--") && ![...mode, "--prod"].includes(arg)) || args.filter((arg) => !arg.startsWith("--")).length > 1) {
  throw new Error("Usage: node --env-file-if-exists=.env scripts/provision/provision-lake-previews.mjs [directory] (--prepare | --verify-only | --provision) [--prod]");
}
const directory = args.find((arg) => !arg.startsWith("--")) ?? ".topostack/lake-previews";
const { pin, objects } = await inspectPreviews(directory);
if (mode[0] === "--prepare") {
  await writeJsonAtomic(fileURLToPath(pinPath), pin);
  console.log(`Prepared a pin for ${Object.keys(pin.lakes).length} lake previews (${objects.length} objects); provision both buckets before merging it.`);
} else {
  assert.deepEqual(pin, JSON.parse(await readFile(pinPath, "utf8")), "Rendered previews differ from the committed pin. Prepare and review the new pin first.");
  if (mode[0] === "--provision") {
    const bucket = args.includes("--prod") ? "topostack-vector-data" : "topostack-vector-data-development";
    const cloudflare = cloudflareClient();
    const parentAccessKeyId = await verifyParentToken(cloudflare);
    const { request } = await temporaryR2Client({ cloudflare, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, bucket, parentAccessKeyId,
      permission: "object-read-write", prefixes: ["lake-previews/"], ttlSeconds: 3600 });
    let verified = 0;
    await publishPreviews(request, objects, () => { if (++verified % 100 === 0) console.log(`Verified ${verified}/${objects.length} previews in ${bucket}.`); });
    await writeJsonAtomic(`.topostack/lake-previews-${bucket}.provisioning.json`, { bucket, lakes: Object.keys(pin.lakes).length, objects: objects.length, verifiedAt: new Date().toISOString() });
    console.log(`Published and verified ${objects.length} previews in ${bucket}.`);
  } else console.log(`Verified ${objects.length} previews against the committed pin.`);
}
