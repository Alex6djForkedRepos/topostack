import { generateGeometry, type SourceBundleV1 } from "@topostack/core";
import type { GeometryWorkerReady, GeometryWorkerRequest, GeometryWorkerResponse } from "$lib/workers/geometry-worker-client";

// The worker is long-lived and keeps the last source it was sent, so edits that
// only change project settings avoid re-cloning large elevation and depth grids.
let cached: { id: number; source: SourceBundleV1 } | undefined;

const reply = (message: GeometryWorkerResponse) => self.postMessage(message);

self.onmessage = (event: MessageEvent<GeometryWorkerRequest>) => {
  const { id, config, sourceId, source } = event.data;
  if (source) cached = { id: sourceId, source };
  if (!cached || cached.id !== sourceId) { reply({ id, missingSource: true }); return; }
  try {
    reply({ id, result: generateGeometry(config, cached.source) });
  } catch (error) {
    reply({ id, error: error instanceof Error ? error.message : "Geometry generation failed." });
  }
};

// Module imports have evaluated by now, so the script demonstrably loaded.
self.postMessage({ ready: true } satisfies GeometryWorkerReady);
