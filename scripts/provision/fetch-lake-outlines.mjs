/** Deployment preflight, or recovery of a pinned release into the ignored build directory. */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { digest, inspectOutlines, releasePath } from "../lib/lake-outlines.mjs";
import { cloudflareClient } from "../lib/cloudflare-client.mjs";
import { temporaryR2Client, verifyParentToken } from "../lib/r2-s3.mjs";

const args = process.argv.slice(2);
if (args.some((arg) => !["--prod", "--download"].includes(arg))) throw new Error("Usage: node --env-file-if-exists=.env scripts/provision/fetch-lake-outlines.mjs [--prod] [--download]");
const release = JSON.parse(await readFile(releasePath));
const bucket = args.includes("--prod") ? "topostack-vector-data" : "topostack-vector-data-development";
const cloudflare = cloudflareClient();
const parentAccessKeyId = await verifyParentToken(cloudflare);
const { request } = await temporaryR2Client({ cloudflare, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, bucket, parentAccessKeyId,
  permission: "object-read-only", prefixes: ["lake-outlines/"], ttlSeconds: 3600 });
const response = await request(`lake-outlines/${release.index.file}`, { method: "GET", headers: { "accept-encoding": "identity" } });
assert.equal(response.status, 200, "Pinned outline index is not provisioned");
assert.equal(Number(response.headers.get("content-length")), release.index.bytes);
const bytes = Buffer.from(await response.arrayBuffer());
assert.equal(digest(bytes), release.index.sha256);
const index = JSON.parse(bytes);
assert.equal(index.schemaVersion, 1);
assert.equal(index.shards.length, release.shards);
const download = args.includes("--download");
const output = resolve(".topostack/lake-outlines");
if (download) await mkdir(output, { recursive: true });
let totalBytes = bytes.length;
const queue = [...index.shards];
const results = await Promise.allSettled(Array.from({ length: 6 }, async () => {
  while (queue.length) {
    const shard = queue.shift();
    assert.match(shard.file, /^[a-f0-9]{24}\.json$/);
    const remote = await request(`lake-outlines/${shard.file}`, { method: download ? "GET" : "HEAD", headers: { "accept-encoding": "identity" } });
    assert.equal(remote.status, 200, `Missing shard ${shard.file}`);
    const size = Number(remote.headers.get("content-length"));
    assert(size > 0 && size < 5_000_000);
    const sha = remote.headers.get("x-amz-meta-sha256");
    assert.match(sha ?? "", /^[a-f0-9]{64}$/);
    assert.equal(sha.slice(0, 24) + ".json", shard.file);
    totalBytes += size;
    if (download) {
      const body = Buffer.from(await remote.arrayBuffer());
      assert.equal(body.length, size); assert.equal(digest(body), sha);
      await writeFile(resolve(output, shard.file), body);
    }
  }
}));
const failed = results.find((result) => result.status === "rejected");
if (failed) throw failed.reason;
assert.equal(totalBytes, release.totalBytes);
if (download) {
  await writeFile(resolve(output, "index.json"), bytes);
  assert.deepEqual((await inspectOutlines(output)).release, release);
}
console.log(`${download ? "Downloaded and verified" : "Verified index and shard metadata for"} ${release.shards} shards in ${bucket}.`);
