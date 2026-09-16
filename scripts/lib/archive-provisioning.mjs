import { createHash, randomUUID } from "node:crypto";
import { AwsClient } from "aws4fetch";
import { parseArchiveRelease } from "../../packages/core/src/archive-release.ts";

export async function verifyArchiveResponse(response, expectedBytes, expectedDigest) {
  if (response.status !== 200 || !response.body) throw new Error(`Archive verification GET failed (${response.status}).`);
  if (Number(response.headers.get("content-length")) !== expectedBytes) {
    await response.body.cancel();
    throw new Error("Remote archive size mismatch.");
  }
  const etag = response.headers.get("etag");
  if (!etag || !/^"[^"\r\n]+"$/.test(etag)) { await response.body.cancel(); throw new Error("Remote archive needs a strong ETag."); }
  const hash = createHash("sha256");
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > expectedBytes) throw new Error("Remote archive exceeds expected size.");
      hash.update(part.value);
    }
    if (bytes !== expectedBytes || hash.digest("hex") !== expectedDigest) throw new Error("Remote archive SHA-256/size verification failed.");
    return etag;
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

/** Stage and fully verify before a conditional, atomic pointer promotion. */
export async function stageArchive({ logicalKey, dataset, bytes, sha256, upload, request, promote = false, id = randomUUID(), checkpoint = async () => {} }) {
  const objectKey = `archives/${sha256}/${id}.pmtiles`;
  const pointerKey = `releases/${logicalKey}.json`;
  const previous = await request(pointerKey, { method: "GET" });
  let previousEtag, previousRelease = null;
  if (previous.status === 200) {
    previousEtag = previous.headers.get("etag");
    if (!previousEtag || Number(previous.headers.get("content-length")) > 16_384) { await previous.body?.cancel(); throw new Error("Invalid existing release pointer."); }
    previousRelease = parseArchiveRelease(await previous.json(), logicalKey);
  } else if (previous.status !== 404) {
    await previous.body?.cancel(); throw new Error(`Release lookup failed (${previous.status}).`);
  } else await previous.body?.cancel();
  await upload(objectKey);
  const downloaded = await request(objectKey, { method: "GET", signal: AbortSignal.timeout(2 * 60 * 60 * 1000) });
  const etag = await verifyArchiveResponse(downloaded, bytes, sha256);
  const release = parseArchiveRelease({ schemaVersion: 1, logicalKey, objectKey, dataset, bytes, sha256, etag, verifiedAt: new Date().toISOString() }, logicalKey);
  const receipt = { release, previousRelease, previousEtag: previousEtag ?? null, promoted: false };
  // Retain rollback information even if promotion or a subsequent bucket fails.
  await checkpoint(receipt);
  if (promote) {
    const result = await request(pointerKey, { method: "PUT", headers: {
      "content-type": "application/json", "cache-control": "no-store",
      ...(previousEtag ? { "if-match": previousEtag } : { "if-none-match": "*" }),
    }, body: JSON.stringify(release) });
    if (!result.ok) { await result.body?.cancel(); throw new Error(`Release promotion failed (${result.status}); inspect the current pointer before retrying.`); }
    await result.body?.cancel();
    receipt.promoted = true;
    await checkpoint(receipt);
  }
  return receipt;
}

export async function verifyPromotionGateway(origin, request = fetch) {
  const response = await request(new URL("/v1/manifest", origin), { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok || (await response.json()).capabilities?.archiveReleases !== 1) throw new Error(`Deploy the release-aware gateway at ${origin} before promoting archives.`);
}

export async function provisionVerifiedArchives({ accountId, cloudflare, buckets, logicalKey, dataset, archivePath, sha256, bytes, pmtilesBin, run, promote, checkpoint }) {
  if (promote) {
    const origins = { "topostack-vector-data-development": "https://dev-topostack.echofoxtrot.works", "topostack-vector-data": "https://topostack.echofoxtrot.works" };
    for (const bucket of buckets) {
      if (!origins[bucket]) throw new Error("No promotion gateway is registered for this bucket.");
      await verifyPromotionGateway(origins[bucket]);
    }
  }
  const parent = await cloudflare("/tokens/verify");
  if (!parent?.id || parent.status !== "active") throw new Error("The account API token is not active.");
  const receipts = [];
  for (const bucket of buckets) {
    const id = randomUUID();
    const objectKey = `archives/${sha256}/${id}.pmtiles`;
    const credentials = await cloudflare("/r2/temp-access-credentials", { method: "POST", body: JSON.stringify({
      bucket, parentAccessKeyId: parent.id, permission: "object-read-write", ttlSeconds: 86400,
      objects: [objectKey, `releases/${logicalKey}.json`],
    }) });
    if (!credentials?.accessKeyId || !credentials.secretAccessKey || !credentials.sessionToken) throw new Error("Missing temporary R2 credentials.");
    const client = new AwsClient({ ...credentials, service: "s3", region: "auto", retries: 0 });
    const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
    const request = async (key, init) => client.fetch(`${endpoint}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`, { signal: AbortSignal.timeout(30_000), ...init });
    console.log(`Staging and verifying ${logicalKey} in ${bucket}.`);
    const receipt = await stageArchive({ logicalKey, dataset, bytes, sha256, id, request, promote,
      upload: (key) => run(pmtilesBin, ["upload", archivePath, key, `--bucket=s3://${bucket}?endpoint=${endpoint}&region=auto&use_path_style=true`, "--max-concurrency=8"], {
        AWS_ACCESS_KEY_ID: credentials.accessKeyId, AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey, AWS_SESSION_TOKEN: credentials.sessionToken,
      }),
      checkpoint: (receipt) => checkpoint({ bucket, ...receipt }),
    });
    receipts.push({ bucket, ...receipt });
  }
  return receipts;
}
