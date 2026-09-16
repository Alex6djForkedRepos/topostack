import { EtagMismatch, FetchSource, PMTiles, type RangeResponse } from "pmtiles";

export const NETWORK_TIMEOUT_MS = 20_000;

export function networkSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(NETWORK_TIMEOUT_MS);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** One cache per operation: failed/aborted header promises never poison retries. */
export function createArchive(url: string, operationSignal?: AbortSignal): PMTiles {
  class OperationSource extends FetchSource {
    private operationEtag?: string;

    override async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
      const signals = [operationSignal, signal].filter((item): item is AbortSignal => !!item);
      const bounded = networkSignal(signals.length ? AbortSignal.any(signals) : undefined);
      bounded.throwIfAborted();
      // Includes headers, directories, and response bodies, even when PMTiles
      // does not forward the caller's signal to a shared cache request.
      const response = await super.getBytes(offset, length, bounded, etag).catch((error: unknown) => {
        // Retrying a single tile could mix generations, and PMTiles starts a
        // detached header refresh on mismatch. End this operation instead.
        if (error instanceof EtagMismatch) throw new Error("Archive changed during generation. Try generating again.", { cause: error });
        throw error;
      });
      if (!response.etag) throw new Error("Archive response is missing a strong ETag.");
      // PMTiles can retry an individual lookup after an ETag change. Previously
      // completed tiles in this operation would still belong to the old archive.
      // Reject the whole source instead of merging two archive generations.
      if (this.operationEtag && response.etag !== this.operationEtag) {
        throw new Error("Archive changed during generation. Try generating again.");
      }
      this.operationEtag ??= response.etag;
      return response;
    }
  }
  return new PMTiles(new OperationSource(url));
}
