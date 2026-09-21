/**
 * A lazily imported chunk failed to load. After a deploy the old hashed chunk
 * names disappear, so the practical remedy is a reload rather than a retry.
 */
export class ModuleLoadError extends Error {
  override readonly name = "ModuleLoadError";
  constructor(label: string, cause?: unknown) {
    super(`${label} could not load · reload to update TopoStack`, cause === undefined ? undefined : { cause });
  }
}

/**
 * Memoize a dynamic import. A rejected load is forgotten, so a network blip or
 * replaced deploy never leaves the feature broken for the rest of the session;
 * the next call imports again. Failures reject with `ModuleLoadError`.
 */
export function retryingLoader<T>(load: () => Promise<T>, label: string): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    if (pending) return pending;
    const request = load().catch((error: unknown) => { throw error instanceof ModuleLoadError ? error : new ModuleLoadError(label, error); });
    pending = request;
    request.catch(() => { if (pending === request) pending = undefined; });
    return request;
  };
}
