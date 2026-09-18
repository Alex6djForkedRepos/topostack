// A terrain GET reads the R2 cache before its upstream budget is consulted,
// because a cached tile must stay free. That leaves one unmetered R2 read per
// request for a client walking distinct coordinates: it is refused every time,
// yet every refusal still costs a read, and read operations are what the R2
// bill is made of.
//
// Once a client is over its per-client terrain budget, the next refusals are
// answered without touching R2 until the limiter's window has passed. Clients
// that never exceed the budget are never recorded here, so the shared path is
// unchanged.
const REFUSAL_TTL_MS = 60_000;
// Bounded so a flood of distinct client keys cannot grow the isolate's memory.
const MAX_TRACKED_CLIENTS = 1_000;

const refusedUntil = new Map<string, number>();

export function recordTerrainRefusal(key: string, now: number = Date.now()): void {
  if (refusedUntil.size >= MAX_TRACKED_CLIENTS) {
    for (const [tracked, expiresAt] of refusedUntil) if (expiresAt <= now) refusedUntil.delete(tracked);
    // Still full: drop the oldest insertion rather than stop recording.
    if (refusedUntil.size >= MAX_TRACKED_CLIENTS) {
      const oldest = refusedUntil.keys().next();
      if (!oldest.done) refusedUntil.delete(oldest.value);
    }
  }
  refusedUntil.set(key, now + REFUSAL_TTL_MS);
}

export function isTerrainRefused(key: string, now: number = Date.now()): boolean {
  const expiresAt = refusedUntil.get(key);
  if (expiresAt === undefined) return false;
  if (expiresAt > now) return true;
  refusedUntil.delete(key);
  return false;
}

/** Test hook: isolates share module state across requests. */
export function resetTerrainRefusals(): void {
  refusedUntil.clear();
}
