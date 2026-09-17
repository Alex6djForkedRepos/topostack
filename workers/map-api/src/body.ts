export class BodyTooLargeError extends Error {
  constructor() { super("BODY_TOO_LARGE"); this.name = "BodyTooLargeError"; }
}

/** Reads a stream into memory, cancelling it once it exceeds `maximumBytes`. */
export async function readBounded(body: ReadableStream<Uint8Array> | null, maximumBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) throw new BodyTooLargeError();
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
