/** Cache storage is an optimization, never a prerequisite for upstream access. */
export async function readCache(bucket: R2Bucket, key: string, source: string): Promise<R2ObjectBody | null> {
  try {
    return await bucket.get(key);
  } catch {
    // Do not log keys: future providers may put sensitive inputs in them.
    console.warn(JSON.stringify({ message: "cache_failed", operation: "read", source }));
    return null;
  }
}

export function writeCache(ctx: ExecutionContext, source: string, write: () => Promise<unknown>): void {
  ctx.waitUntil(Promise.resolve().then(write).catch(() => {
    console.warn(JSON.stringify({ message: "cache_failed", operation: "write", source }));
  }));
}
