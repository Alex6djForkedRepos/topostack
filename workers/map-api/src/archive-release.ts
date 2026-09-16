import { parseArchiveRelease, type ArchiveRelease } from "../../../packages/core/src/archive-release";

/** Legacy objects remain available until an explicitly promoted release exists. */
export async function archiveHead(bucket: R2Bucket, logicalKey: string): Promise<{ key: string; head: R2Object | null; release?: ArchiveRelease }> {
  const pointer = await bucket.get(`releases/${logicalKey}.json`);
  if (!pointer) return { key: logicalKey, head: await bucket.head(logicalKey) };
  if (pointer.size > 16_384) { await pointer.body.cancel(); throw new Error("Archive release pointer exceeds its size limit."); }
  const release = parseArchiveRelease(await pointer.json(), logicalKey);
  const head = await bucket.head(release.objectKey);
  if (!head || head.size !== release.bytes || head.httpEtag !== release.etag) throw new Error("Promoted archive is missing or has changed since verification.");
  return { key: release.objectKey, head, release };
}
