import { generateGeometry, type GeometryIRV1, type ProjectConfigV1, type SourceBundleV1 } from "@topostack/core";

/** Messages exchanged with geometry.worker.ts. */
export interface GeometryWorkerRequest {
  id: number;
  config: ProjectConfigV1;
  /** Identity of the source bundle. The worker keeps the last one it received. */
  sourceId: number;
  /** Omitted when the worker already holds `sourceId`, so a slider tick posts only config. */
  source?: SourceBundleV1;
}
export interface GeometryWorkerResponse {
  id: number;
  result?: GeometryIRV1;
  error?: string;
  /** The worker no longer holds the source this request referenced. */
  missingSource?: boolean;
}

const sourceIds = new WeakMap<SourceBundleV1, number>();
let lastSourceId = 0;
/** Stable per-object identity, so an unchanged source is never structured-cloned twice. */
export function sourceIdentity(source: SourceBundleV1): number {
  let id = sourceIds.get(source);
  if (id === undefined) { id = ++lastSourceId; sourceIds.set(source, id); }
  return id;
}

type WorkerFactory = () => Worker;
type Generate = (config: ProjectConfigV1, source: SourceBundleV1) => GeometryIRV1;

export const defaultWorkerFactory: WorkerFactory | undefined = typeof Worker === "undefined"
  ? undefined
  : () => new Worker(new URL("../geometry.worker.ts", import.meta.url), { type: "module" });

interface PendingRequest {
  id: number;
  worker: Worker;
  config: ProjectConfigV1;
  source: SourceBundleV1;
  sourceId: number;
  resentSource: boolean;
  resolve: (result: GeometryIRV1) => void;
  reject: (reason: unknown) => void;
}

/**
 * One long-lived geometry worker. It is terminated only to abandon an
 * in-flight computation (or after it fails), and it caches the last source so
 * repeated edits against unchanged map data post only the project config.
 * Falls back to main-thread generation where workers are unavailable — no
 * Worker in jsdom, or a CSP that blocks worker construction inside a host frame.
 */
export class GeometryWorkerClient {
  private worker: Worker | undefined;
  private workerSourceId = 0;
  private workerProven = false;
  private unavailable: boolean;
  private pending: PendingRequest | undefined;
  private nextId = 0;

  constructor(private readonly factory: WorkerFactory | undefined = defaultWorkerFactory, private readonly generate: Generate = generateGeometry) {
    this.unavailable = !factory;
  }

  get busy(): boolean { return this.pending !== undefined; }

  run(config: ProjectConfigV1, source: SourceBundleV1): Promise<GeometryIRV1> {
    this.cancel(new DOMException("Preview superseded", "AbortError"));
    const worker = this.unavailable ? undefined : this.ensureWorker();
    if (!worker) return this.runSynchronously(config, source);
    return new Promise<GeometryIRV1>((resolve, reject) => {
      const request: PendingRequest = { id: ++this.nextId, worker, config, source, sourceId: sourceIdentity(source), resentSource: false, resolve, reject };
      this.pending = request;
      this.post(request, request.sourceId !== this.workerSourceId);
    });
  }

  /** Abandon the in-flight request, if any. An idle worker and its cached source are kept. */
  cancel(reason: unknown = new DOMException("Preview superseded", "AbortError")): void {
    const request = this.pending;
    if (!request) return;
    this.pending = undefined;
    this.discardWorker(request.worker);
    request.reject(reason);
  }

  dispose(): void {
    this.cancel(new DOMException("Generator closed", "AbortError"));
    if (this.worker) this.discardWorker(this.worker);
  }

  private runSynchronously(config: ProjectConfigV1, source: SourceBundleV1): Promise<GeometryIRV1> {
    try { return Promise.resolve(this.generate(config, source)); }
    catch (error) { return Promise.reject(error); }
  }

  private ensureWorker(): Worker | undefined {
    if (this.worker) return this.worker;
    let worker: Worker;
    try { worker = this.factory!(); }
    catch (error) {
      console.warn("TopoStack geometry worker is unavailable; generating on the main thread.", error);
      this.unavailable = true;
      return undefined;
    }
    this.worker = worker;
    this.workerSourceId = 0;
    this.workerProven = false;
    worker.onmessage = (event: MessageEvent<GeometryWorkerResponse>) => this.handleMessage(worker, event.data);
    worker.onerror = (event) => { event.preventDefault?.(); this.handleFailure(worker, new Error(event.message || "Geometry worker failed.")); };
    worker.onmessageerror = () => this.handleFailure(worker, new Error("Geometry worker returned an unreadable result."));
    return worker;
  }

  private post(request: PendingRequest, includeSource: boolean): void {
    const message: GeometryWorkerRequest = { id: request.id, config: request.config, sourceId: request.sourceId, ...(includeSource ? { source: request.source } : {}) };
    try {
      request.worker.postMessage(message);
      if (includeSource) this.workerSourceId = request.sourceId;
    } catch (error) {
      this.handleFailure(request.worker, error);
    }
  }

  private handleMessage(worker: Worker, data: GeometryWorkerResponse): void {
    const request = this.pending;
    // Late replies from a replaced worker or a superseded request are ignored.
    if (worker !== this.worker || !request || request.worker !== worker || data.id !== request.id) return;
    this.workerProven = true;
    if (data.missingSource && !request.resentSource) {
      request.resentSource = true;
      this.post(request, true);
      return;
    }
    this.pending = undefined;
    if (data.result) request.resolve(data.result);
    else request.reject(new Error(data.error ?? "Geometry generation failed."));
  }

  private handleFailure(worker: Worker, error: unknown): void {
    if (worker !== this.worker) return;
    const neverWorked = !this.workerProven;
    this.discardWorker(worker);
    const request = this.pending?.worker === worker ? this.pending : undefined;
    if (!request) return;
    this.pending = undefined;
    // A worker that never answered was most likely blocked from loading (CSP
    // in an embedding host). Finish this request on the main thread and stop
    // trying workers, instead of failing every future edit.
    if (neverWorked) {
      this.unavailable = true;
      console.warn("TopoStack geometry worker failed to start; generating on the main thread.", error);
      this.runSynchronously(request.config, request.source).then(request.resolve, request.reject);
      return;
    }
    request.reject(error);
  }

  private discardWorker(worker: Worker): void {
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
    if (this.worker === worker) { this.worker = undefined; this.workerSourceId = 0; }
  }
}

