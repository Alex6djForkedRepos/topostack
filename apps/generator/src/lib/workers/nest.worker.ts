import { planSheets, rectangleEngine, SheetNestError, type StripEngine } from "@topostack/core";
import { loadNestEngine } from "@topostack/nest-wasm";
import wasmUrl from "@topostack/nest-wasm/wasm?url";
import type { NestWorkerReply, NestWorkerRequest } from "$lib/workers/nest-client";

/**
 * Sheet nesting runs here: sparrow blocks for its whole time budget, which
 * would freeze the studio on the main thread. The engine is fetched only when
 * the first job arrives. Where WebAssembly cannot start (an old browser, or a
 * host page whose policy forbids compiling it) the bounding-box packer stands
 * in, and the reply says so.
 */

let engine: Promise<{ engine: StripEngine; fallbackReason?: string }> | undefined;

function loadEngine() {
  engine ??= loadNestEngine(wasmUrl).then(
    (nest) => ({ engine: { name: "sparrow", info: nest.info, pack: (job) => nest.pack(job) } satisfies StripEngine }),
    (error: unknown) => ({ engine: rectangleEngine, fallbackReason: error instanceof Error ? error.message : String(error) }),
  );
  return engine;
}

const reply = (message: NestWorkerReply) => self.postMessage(message);

self.onmessage = (event: MessageEvent<NestWorkerRequest>) => { void handle(event.data); };

async function handle({ id, parts, settings, budgetMs }: NestWorkerRequest): Promise<void> {
  try {
    const { engine: chosen, fallbackReason } = await loadEngine();
    if (fallbackReason) reply({ id, fallbackReason });
    const plan = await planSheets(parts, settings, { engine: chosen, budgetMs, onPlan: (draft) => reply({ id, draft }) });
    reply({ id, plan });
  } catch (error) {
    reply({
      id,
      error: error instanceof Error ? error.message : "Sheet nesting failed.",
      ...(error instanceof SheetNestError ? { code: error.code, labels: error.labels } : {}),
    });
  }
}

self.postMessage({ ready: true } satisfies NestWorkerReply);
