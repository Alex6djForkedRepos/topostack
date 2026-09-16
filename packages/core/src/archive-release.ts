/** A small, atomically promoted pointer to an independently verified archive. */
export interface ArchiveRelease {
  schemaVersion: 1;
  logicalKey: string;
  objectKey: string;
  dataset: string;
  sha256: string;
  bytes: number;
  etag: string;
  verifiedAt: string;
}

export function parseArchiveRelease(value: unknown, logicalKey: string): ArchiveRelease {
  if (!value || typeof value !== "object") throw new Error("Invalid archive release.");
  const r = value as Record<string, unknown>;
  if (r.schemaVersion !== 1 || r.logicalKey !== logicalKey || typeof r.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(r.sha256)
    || typeof r.objectKey !== "string" || !new RegExp(`^archives/${r.sha256}/[a-f0-9-]{36}\\.pmtiles$`).test(r.objectKey)
    || typeof r.dataset !== "string" || !r.dataset.trim() || r.dataset.length > 200
    || typeof r.bytes !== "number" || !Number.isSafeInteger(r.bytes) || r.bytes < 127
    || typeof r.etag !== "string" || !/^"[^"\r\n]+"$/.test(r.etag)
    || typeof r.verifiedAt !== "string" || !Number.isFinite(Date.parse(r.verifiedAt))) throw new Error("Invalid archive release.");
  return { schemaVersion: 1, logicalKey, objectKey: r.objectKey, dataset: r.dataset, sha256: r.sha256, bytes: r.bytes, etag: r.etag, verifiedAt: r.verifiedAt };
}
