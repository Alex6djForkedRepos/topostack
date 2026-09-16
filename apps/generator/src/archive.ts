import { EtagMismatch, FetchSource, PMTiles, type Header, type RangeResponse } from "pmtiles";

export const NETWORK_TIMEOUT_MS = 20_000;

export function networkSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(NETWORK_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** The archive operations generation uses. */
export type Archive = Pick<PMTiles, "getHeader" | "getMetadata" | "getZxy">;

interface CachedArchive {
  reader: PMTiles;
  metadata?: Promise<unknown>;
}

/**
 * One reader per archive URL, so the header, root and leaf directories, and
 * metadata are fetched once per archive generation instead of per operation.
 * A reader is evicted on any failure or ETag change: failed header promises
 * never poison retries, and a replaced archive starts a fresh reader.
 */
const readers = new Map<string, CachedArchive>();

/** Forget every cached archive reader. */
export function clearArchiveCache(): void { readers.clear(); }

const changed = (cause?: unknown) => new Error("Archive changed during generation. Try generating again.", cause === undefined ? undefined : { cause });

function readerFor(url: string): CachedArchive {
  const existing = readers.get(url);
  if (existing) return existing;
  const evict = () => { if (readers.get(url) === entry) readers.delete(url); };

  class ArchiveSource extends FetchSource {
    private archiveEtag?: string;

    override async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
      // Includes headers, directories, and response bodies. PMTiles does not
      // forward a signal to the shared header request, so it is bounded here.
      const bounded = networkSignal(signal);
      bounded.throwIfAborted();
      try {
        const response = await super.getBytes(offset, length, bounded, etag).catch((error: unknown) => {
          // Retrying a single tile could mix generations, and PMTiles starts a
          // detached header refresh on mismatch. End this operation instead.
          if (error instanceof EtagMismatch) throw changed(error);
          throw error;
        });
        if (!response.etag) throw new Error("Archive response is missing a strong ETag.");
        // PMTiles can re-read a pruned header or retry a lookup after an ETag
        // change. Everything this reader returned belongs to one archive
        // generation, so reject the reader instead of merging two.
        if (this.archiveEtag && response.etag !== this.archiveEtag) throw changed();
        this.archiveEtag ??= response.etag;
        return response;
      } catch (error) {
        // A caller's cancellation leaves the reader intact; anything else may
        // have left a rejected promise in the PMTiles cache.
        if (!signal?.aborted) evict();
        throw error;
      }
    }
  }

  const entry: CachedArchive = { reader: new PMTiles(new ArchiveSource(url)) };
  readers.set(url, entry);
  return entry;
}

/** Settle with `promise`, or reject as soon as `signal` aborts. */
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

/**
 * An archive handle for one generation operation. It shares the URL's cached
 * reader, rejects as soon as `operationSignal` aborts, and fails if the
 * archive's generation changes while the operation runs.
 */
export function createArchive(url: string, operationSignal?: AbortSignal): Archive {
  let entry: CachedArchive | undefined;
  let operationEtag: string | undefined;
  const evict = () => { if (entry && readers.get(url) === entry) readers.delete(url); };

  const run = async <T>(task: (entry: CachedArchive, signal?: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> => {
    const signals = [operationSignal, signal].filter((item): item is AbortSignal => !!item);
    const combined = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    combined?.throwIfAborted();
    entry ??= readerFor(url);
    const current = entry;
    const work = (async () => {
      const header = await current.reader.getHeader();
      if (operationEtag && header.etag !== operationEtag) throw changed();
      operationEtag ??= header.etag;
      return task(current, combined);
    })();
    // Evict on genuine failures even if this operation stopped waiting.
    work.catch(() => { if (!combined?.aborted) evict(); });
    return abortable(work, combined);
  };

  return {
    getHeader: () => run(async ({ reader }): Promise<Header> => reader.getHeader()),
    getMetadata: () => run(async (cached) => {
      const metadata = cached.metadata ??= cached.reader.getMetadata();
      return await metadata;
    }),
    getZxy: (z: number, x: number, y: number, signal?: AbortSignal) => run(async ({ reader }, combined) => reader.getZxy(z, x, y, combined), signal),
  };
}
