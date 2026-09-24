import { executeGeometryTask, type GeometryBatch, type GeometryTask, type GeometryTaskResult, type ProjectConfigV1 } from "@topostack/core";

export type TaskRequest =
  | { type: "configure"; batchId: number; config: ProjectConfigV1 }
  | { type: "run"; batchId: number; requestId: number; tasks: GeometryTask[] };
export type TaskResponse =
  | { type: "ready"; batchId: number }
  | { type: "result"; batchId: number; requestId: number; results: GeometryTaskResult[] }
  | { type: "error"; batchId: number; error: string };

/** Small interface also implemented by the Node benchmark adapter. */
export interface TaskWorker {
  onmessage: ((event: MessageEvent<TaskResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: TaskRequest): void;
  terminate(): void;
}
interface Slot {
  worker: TaskWorker;
  pending?: { resolve: (message: TaskResponse) => void; reject: (error: unknown) => void; timer: ReturnType<typeof setTimeout> };
}

/** Leave a logical CPU for the page; never create more than four helpers. */
export function geometryWorkerCount(hardwareConcurrency: number | undefined): number {
  return Number.isFinite(hardwareConcurrency) ? Math.min(4, Math.max(0, Math.floor(hardwareConcurrency!) - 1)) : 1;
}

/** Persistent helpers, at most two layers in flight per helper, stable result ordering. */
export class GeometryTaskPool {
  private slots: Slot[] = [];
  private batchId = 0;
  private requestId = 0;
  private busy = false;
  private disabled = false;
  private disposed = false;

  constructor(
    private readonly factory: () => TaskWorker,
    private readonly size: number,
    private readonly timeoutMs = 30_000,
    private readonly onFallback: (error: unknown) => void = () => undefined,
  ) {}

  async run(batch: GeometryBatch, signal: AbortSignal, onProgress?: (completed: number, total: number) => void): Promise<GeometryTaskResult[]> {
    signal.throwIfAborted();
    if (this.disposed) throw new DOMException("Geometry pool closed", "AbortError");
    if (this.busy) throw new Error("Geometry task pool is already running.");
    this.busy = true;
    const abort = () => this.reset(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    try {
      if (this.disabled || !Number.isFinite(this.size) || this.size < 1 || batch.tasks.length < 2) return await this.serial(batch, signal, onProgress);
      try {
        const count = Math.min(4, Math.floor(this.size), Math.ceil(batch.tasks.length / 2));
        while (this.slots.length < count) this.slots.push(this.createSlot());
        const batchId = ++this.batchId;
        const results = new Array<GeometryTaskResult>(batch.tasks.length);
        let next = 0, completed = 0;
        await Promise.all(this.slots.slice(0, count).map(async slot => {
          const ready = await this.send(slot, { type: "configure", batchId, config: batch.config });
          if (batchId !== this.batchId) throw new Error("Geometry batch was interrupted.");
          if (ready.type !== "ready" || ready.batchId !== batchId) throw new Error("Invalid geometry worker initialization.");
          while (next < batch.tasks.length) {
            signal.throwIfAborted();
            const start = next;
            next += 2;
            const tasks = batch.tasks.slice(start, next);
            const requestId = ++this.requestId;
            const reply = await this.send(slot, { type: "run", batchId, requestId, tasks });
            if (batchId !== this.batchId) throw new Error("Geometry batch was interrupted.");
            if (reply.type !== "result" || reply.batchId !== batchId || reply.requestId !== requestId || reply.results.length !== tasks.length ||
              reply.results.some((result, i) => result.kind !== tasks[i]!.kind)) throw new Error("Invalid geometry task result.");
            reply.results.forEach((result, i) => { results[start + i] = result; });
            completed += tasks.length;
            onProgress?.(completed, batch.tasks.length);
          }
        }));
        signal.throwIfAborted();
        return results;
      } catch (error) {
        this.reset(error);
        signal.throwIfAborted();
        if (this.disposed) throw error;
        // Inputs were never mutated, so the entire stage can be retried safely.
        this.disabled = true;
        this.onFallback(error);
        return await this.serial(batch, signal, onProgress);
      }
    } finally {
      signal.removeEventListener("abort", abort);
      this.busy = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disabled = true;
    this.reset(new DOMException("Geometry pool closed", "AbortError"));
  }

  private async serial(batch: GeometryBatch, signal: AbortSignal, progress?: (completed: number, total: number) => void): Promise<GeometryTaskResult[]> {
    const results: GeometryTaskResult[] = [];
    for (let i = 0; i < batch.tasks.length; i++) {
      // Yield between chunks even without helper support, so cancellation can arrive.
      if (i % 2 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
      signal.throwIfAborted();
      if (this.disposed) throw new DOMException("Geometry pool closed", "AbortError");
      results.push(executeGeometryTask(batch.config, batch.tasks[i]!));
      progress?.(i + 1, batch.tasks.length);
    }
    return results;
  }

  private createSlot(): Slot {
    const slot: Slot = { worker: this.factory() };
    slot.worker.onmessage = ({ data }) => {
      if (data.type === "error") this.reject(slot, new Error(data.error));
      else {
        const pending = slot.pending;
        if (!pending) return;
        clearTimeout(pending.timer);
        slot.pending = undefined;
        pending.resolve(data);
      }
    };
    slot.worker.onerror = event => { event.preventDefault?.(); this.reject(slot, new Error(event.message || "Geometry helper failed.")); };
    slot.worker.onmessageerror = () => this.reject(slot, new Error("Unreadable geometry helper response."));
    return slot;
  }

  private send(slot: Slot, message: TaskRequest): Promise<TaskResponse> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.reject(slot, new Error("Geometry helper timed out.")), this.timeoutMs);
      slot.pending = { resolve, reject, timer };
      try { slot.worker.postMessage(message); } catch (error) { this.reject(slot, error); }
    });
  }

  private reject(slot: Slot, error: unknown): void {
    if (!slot.pending) return;
    clearTimeout(slot.pending.timer);
    const { reject } = slot.pending;
    slot.pending = undefined;
    reject(error);
  }

  private reset(error: unknown): void {
    this.batchId++; // Invalidate continuations whose reply resolved just before reset.
    for (const slot of this.slots) {
      this.reject(slot, error);
      slot.worker.onmessage = null;
      slot.worker.onerror = null;
      slot.worker.onmessageerror = null;
      slot.worker.terminate();
    }
    this.slots = [];
  }
}
