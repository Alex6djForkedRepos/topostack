import { parseArchiveRelease, type ArchiveRelease } from "@topostack/data-contracts/archive-release";

export interface ResolvedArchive { key: string; head: R2Object | null; release?: ArchiveRelease }

/** Legacy objects remain available until an explicitly promoted release exists. */
export async function archiveHead(bucket: R2Bucket, logicalKey: string): Promise<ResolvedArchive> {
  const pointer = await bucket.get(`releases/${logicalKey}.json`);
  if (!pointer) return { key: logicalKey, head: await bucket.head(logicalKey) };
  if (pointer.size > 16_384) { await pointer.body.cancel(); throw new Error("Archive release pointer exceeds its size limit."); }
  const release = parseArchiveRelease(await pointer.json(), logicalKey);
  const head = await bucket.head(release.objectKey);
  if (!head || head.size !== release.bytes || head.httpEtag !== release.etag) throw new Error("Promoted archive is missing or has changed since verification.");
  return { key: release.objectKey, head, release };
}

// PMTiles clients issue many range reads per generation. Resolving the release
// pointer and object head for each one costs two extra R2 operations, so the
// resolution is memoized per isolate. Staleness is bounded by the TTL, and the
// range read itself is conditional on the cached etag: a replaced object fails
// the precondition, the caller evicts the entry and resolves again.
export const ARCHIVE_HEAD_TTL_MS = 60_000;
// Missing archives and invalid release pointers are memoized briefly too, so a
// client polling an unprovisioned route cannot turn every request into R2
// reads, while newly provisioned data still appears within seconds.
export const ARCHIVE_NEGATIVE_TTL_MS = 15_000;
type CachedResolution = { ok: true; value: ResolvedArchive } | { ok: false; error: unknown };
const archiveHeadCache = new Map<string, { resolution: CachedResolution; expiresAt: number }>();

export async function cachedArchiveHead(bucket: R2Bucket, logicalKey: string, now: number = Date.now()): Promise<ResolvedArchive> {
  const entry = archiveHeadCache.get(logicalKey);
  if (entry && entry.expiresAt > now) {
    if (entry.resolution.ok) return entry.resolution.value;
    throw entry.resolution.error;
  }
  archiveHeadCache.delete(logicalKey);
  let value: ResolvedArchive;
  try {
    value = await archiveHead(bucket, logicalKey);
  } catch (error) {
    archiveHeadCache.set(logicalKey, { resolution: { ok: false, error }, expiresAt: now + ARCHIVE_NEGATIVE_TTL_MS });
    throw error;
  }
  archiveHeadCache.set(logicalKey, { resolution: { ok: true, value }, expiresAt: now + (value.head ? ARCHIVE_HEAD_TTL_MS : ARCHIVE_NEGATIVE_TTL_MS) });
  return value;
}

export function evictArchiveHead(logicalKey: string): void {
  archiveHeadCache.delete(logicalKey);
}

/** Test hook: isolates share module state across requests. */
export function resetArchiveHeadCache(): void {
  archiveHeadCache.clear();
}
