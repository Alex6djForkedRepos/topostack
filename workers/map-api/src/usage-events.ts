import { isUsageEvent } from "@topostack/data-contracts/usage";
import { BodyTooLargeError, readBounded } from "./body";

const MAX_EVENT_BYTES = 1024;

export async function collectUsage(request: Request, environment: string): Promise<Response> {
  const respond = (status: number) => new Response(null, { status, headers: { "cache-control": "no-store" } });
  // A public counter is not an authenticated audit trail. Restrict normal browsers
  // to same-origin POSTs, bound the payload and accept only fixed category values.
  if (request.headers.get("origin") !== new URL(request.url).origin) return respond(403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return respond(415);
  if (Number(request.headers.get("content-length")) > MAX_EVENT_BYTES) return respond(413);
  if (!request.body) return respond(400);
  try {
    const bytes = await readBounded(request.body, MAX_EVENT_BYTES);
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isUsageEvent(payload)) return respond(400);
    console.log(JSON.stringify({ message: "usage_event", environment, ...payload }));
    return respond(204);
  } catch (error) {
    return respond(error instanceof BodyTooLargeError ? 413 : 400);
  }
}
