import type { GeometryIRV1, ProjectConfigV1, SourceBundleV1 } from "@topostack/core";
import type { GeometryWorkerClient } from "./geometry-worker-client";
import { ModuleLoadError } from "./lazy-load";

export const isAbortError = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";

export interface PreviewUpdate {
  config: ProjectConfigV1;
  /** Loads or reuses whatever map data the edit needs. */
  prepareSource: (signal: AbortSignal) => Promise<SourceBundleV1>;
  onCommit: (geometry: GeometryIRV1, source: SourceBundleV1) => void;
  onError: (error: unknown) => void;
  /** Runs after a started update ends; `current` is false once a newer edit superseded it. */
  onSettled: (current: boolean) => void;
}

/**
 * Revision-guarded preview refreshes. Every edit bumps the revision through
 * `invalidate`; a refresh commits only if nothing superseded it while it
 * waited, loaded map data, or generated geometry.
 */
export class PreviewPipeline {
  revision = 0;
  private detailAbort: AbortController | undefined;
  private wake: { timer: ReturnType<typeof setTimeout>; resolve: () => void } | undefined;
  private client: GeometryWorkerClient | undefined;
  private clientLoad: Promise<GeometryWorkerClient> | undefined;
  private disposed = false;

  /** The worker client loads on first use, keeping it out of the startup bundle. */
  constructor(private readonly loadClient: () => Promise<GeometryWorkerClient> = async () => {
    const module = await import("./geometry-worker-client").catch((error: unknown) => { throw new ModuleLoadError("The geometry engine", error); });
    return new module.GeometryWorkerClient();
  }) {}

  invalidate(reason?: unknown): void {
    this.revision += 1;
    this.detailAbort?.abort();
    this.detailAbort = undefined;
    if (this.wake) { clearTimeout(this.wake.timer); this.wake.resolve(); this.wake = undefined; }
    this.client?.cancel(reason);
  }

  /** Abandon only in-flight geometry generation. */
  cancelGeometry(reason?: unknown): void { this.client?.cancel(reason); }

  /** Generate on the shared worker, unless `revision` was superseded while the client loaded. */
  async generate(config: ProjectConfigV1, source: SourceBundleV1, revision = this.revision): Promise<GeometryIRV1> {
    if (!this.clientLoad) {
      const load = this.loadClient().then((client) => {
        if (this.disposed) client.dispose();
        this.client = client;
        return client;
      });
      this.clientLoad = load;
      // A failed chunk load (a deploy replaced it, or the network dropped) must
      // not stick: forget it so the next generation retries the import.
      load.catch(() => { if (this.clientLoad === load) this.clientLoad = undefined; });
    }
    const client = this.client ?? await this.clientLoad;
    if (revision !== this.revision || this.disposed) throw new DOMException("Preview superseded", "AbortError");
    return client.run(config, source);
  }

  isCurrent(revision: number, signal?: AbortSignal): boolean {
    return revision === this.revision && !signal?.aborted;
  }

  dispose(): void {
    this.disposed = true;
    this.invalidate(new DOMException("Generator closed", "AbortError"));
    this.client?.dispose();
  }

  /** Trailing-debounced: a newer edit within `delayMs` replaces this one before any work starts. */
  async runPreviewUpdate(update: PreviewUpdate, delayMs = 0): Promise<void> {
    const revision = this.revision;
    if (delayMs > 0) {
      await new Promise<void>((resolve) => { this.wake = { timer: setTimeout(() => { this.wake = undefined; resolve(); }, delayMs), resolve }; });
      if (revision !== this.revision) return;
    }
    const controller = new AbortController();
    this.detailAbort = controller;
    const current = () => this.isCurrent(revision, controller.signal);
    try {
      const source = await update.prepareSource(controller.signal);
      if (!current()) return;
      const geometry = await this.generate(update.config, source, revision);
      if (!current()) return;
      update.onCommit(geometry, source);
    } catch (error) {
      if (!current() || isAbortError(error)) return;
      update.onError(error);
    } finally {
      if (this.detailAbort === controller) this.detailAbort = undefined;
      update.onSettled(revision === this.revision);
    }
  }
}
