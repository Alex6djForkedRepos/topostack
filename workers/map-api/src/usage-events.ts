import { isUsageEvent } from "../../../packages/core/src/usage";

export async function collectUsage(request: Request, environment: string): Promise<Response> {
  const respond = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });
  // A public counter is not an authenticated audit trail. Restrict normal browsers
  // to same-origin POSTs, bound the payload and accept only fixed category values.
  if (request.headers.get("origin") !== new URL(request.url).origin) return respond(403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return respond(415);
  if (Number(request.headers.get("content-length")) > 1024) return respond(413);
  const reader = request.body?.getReader();
  if (!reader) return respond(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) { await reader.cancel(); return respond(413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isUsageEvent(payload)) return respond(400);
    console.log(JSON.stringify({ message: "usage_event", environment, ...payload }));
    return respond(204);
  } catch {
    return respond(400);
  } finally {
    reader.releaseLock();
  }
}
