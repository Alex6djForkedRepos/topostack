/** Runs one cache read; storage failures degrade to a miss instead of an error. */
async function guardedRead<T>(source: string, read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read();
  } catch {
    // Do not log keys: future providers may put sensitive inputs in them.
    console.warn(JSON.stringify({ message: "cache_failed", operation: "read", source }));
    return null;
  }
}

/** Cache storage is an optimization, never a prerequisite for upstream access. */
export function readCache(bucket: R2Bucket, key: string, source: string): Promise<R2ObjectBody | null>;
/** A conditional read returns metadata without a body when the precondition fails. */
export function readCache(bucket: R2Bucket, key: string, source: string, onlyIf: R2Conditional): Promise<R2ObjectBody | R2Object | null>;
export function readCache(bucket: R2Bucket, key: string, source: string, onlyIf?: R2Conditional): Promise<R2ObjectBody | R2Object | null> {
  return guardedRead(source, () => (onlyIf ? bucket.get(key, { onlyIf }) : bucket.get(key)));
}

/** Metadata-only cache lookup with the same failure isolation as readCache. */
export function headCache(bucket: R2Bucket, key: string, source: string): Promise<R2Object | null> {
  return guardedRead(source, () => bucket.head(key));
}

export function writeCache(ctx: ExecutionContext, source: string, write: () => Promise<unknown>): void {
  ctx.waitUntil(Promise.resolve().then(write).catch(() => {
    console.warn(JSON.stringify({ message: "cache_failed", operation: "write", source }));
  }));
}
