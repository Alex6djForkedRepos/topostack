/**
 * Sampling policy for the `request_completed` line.
 *
 * Workers Logs is billed per million lines, and one model generation issues
 * hundreds of archive range reads plus hundreds of terrain tiles - all of them
 * uninteresting cache hits. Those two routes' cached successes are therefore
 * sampled; everything else is logged in full, so errors, cache misses, stale
 * upstream fallbacks and every non-2xx status stay individually visible.
 */
export const REQUEST_LOG_SAMPLE_RATE = 0.02;

/** Cache header values that mean the response never touched an upstream. */
const CACHED = new Set(["EDGE", "HIT", "R2"]);

export function isHighVolumeCacheHit(status: number, cache: string | null): boolean {
  return status >= 200 && status < 300 && cache !== null && CACHED.has(cache);
}

export function shouldLogRequest(
  entry: { highVolumeRoute: boolean; status: number; cache: string | null },
  roll: () => number = Math.random,
): boolean {
  if (!entry.highVolumeRoute || !isHighVolumeCacheHit(entry.status, entry.cache)) return true;
  return roll() < REQUEST_LOG_SAMPLE_RATE;
}
