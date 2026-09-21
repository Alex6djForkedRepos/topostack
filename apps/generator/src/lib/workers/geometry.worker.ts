import { generateGeometry, projectFonts, type SourceBundleV1 } from "@topostack/core";
import { ensureFonts } from "$lib/domain/fonts";
import type { GeometryWorkerReady, GeometryWorkerRequest, GeometryWorkerResponse } from "$lib/workers/geometry-worker-client";

// The worker is long-lived and keeps the last source it was sent, so edits that
// only change project settings avoid re-cloning large elevation and depth grids.
let cached: { id: number; source: SourceBundleV1 } | undefined;

const reply = (message: GeometryWorkerResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<GeometryWorkerRequest>) => { void handle(event.data); };

async function handle({ id, config, sourceId, source }: GeometryWorkerRequest): Promise<void> {
  if (source) cached = { id: sourceId, source };
  if (!cached || cached.id !== sourceId) { reply({ id, missingSource: true }); return; }
  // Hold on to this request's source: a newer message may replace the cache while fonts load.
  const requestSource = cached.source;
  try {
    // The worker has its own font registry; the page's loaded fonts are not visible here.
    await ensureFonts(projectFonts(config));
    reply({ id, result: generateGeometry(config, requestSource) });
  } catch (error) {
    reply({ id, error: error instanceof Error ? error.message : "Geometry generation failed." });
  }
}

// Module imports have evaluated by now, so the script demonstrably loaded.
self.postMessage({ ready: true } satisfies GeometryWorkerReady);
