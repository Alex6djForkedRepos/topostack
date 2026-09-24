import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, executeGeometryTask, type GeometryBatch } from "@topostack/core";
import { GeometryTaskPool, geometryWorkerCount, type TaskRequest, type TaskResponse, type TaskWorker } from "./geometry-task-pool";

const batch: GeometryBatch = {
  config: DEFAULT_PROJECT,
  tasks: Array.from({ length: 9 }, (_, index) => ({
    kind: "alignment" as const,
    layer: { id: String(index), materialThicknessMm: 3, index, elevationM: index, polygons: [], pieces: [], markings: [] },
    nextLayer: { index: index + 1, polygons: [], pieces: [] },
    outlines: [],
  })),
};
const expected = () => batch.tasks.map(task => executeGeometryTask(batch.config, task));
class FakeWorker implements TaskWorker {
  onmessage: TaskWorker["onmessage"] = null;
  onerror: TaskWorker["onerror"] = null;
  onmessageerror: TaskWorker["onmessageerror"] = null;
  terminated = false;
  posted: TaskRequest[] = [];
  constructor(private readonly respond: (message: TaskRequest, worker: FakeWorker) => void = (message, worker) => {
    setTimeout(() => worker.reply(message.type === "configure"
      ? { type: "ready", batchId: message.batchId }
      : { type: "result", batchId: message.batchId, requestId: message.requestId,
        results: message.tasks.map(task => ({ kind: "alignment", markings: [{ id: String(task.layer.index) }] })) } as TaskResponse),
    message.type === "run" && message.tasks[0]!.layer.index === 0 ? 15 : 0);
  }) {}
  postMessage(message: TaskRequest): void { this.posted.push(message); this.respond(message, this); }
  terminate(): void { this.terminated = true; }
  reply(data: TaskResponse): void { if (!this.terminated) this.onmessage?.({ data } as MessageEvent<TaskResponse>); }
}

describe("geometry task pool", () => {
  it("bounds concurrency, restores ordering, reports progress, and reuses workers", async () => {
    const workers: FakeWorker[] = [], progress: number[] = [];
    const pool = new GeometryTaskPool(() => { const worker = new FakeWorker(); workers.push(worker); return worker; }, 99);
    try {
      for (let run = 0; run < 2; run++) {
        const result = await pool.run(batch, new AbortController().signal, n => progress.push(n));
        expect(result.map(result => result.kind === "alignment" && result.markings[0]!.id)).toEqual(batch.tasks.map(task => String(task.layer.index)));
      }
      expect(workers).toHaveLength(4);
      expect(progress.at(-1)).toBe(9);
      expect(workers.flatMap(worker => worker.posted).filter(message => message.type === "run").every(message => message.tasks.length <= 2)).toBe(true);
    } finally { pool.dispose(); }
    expect(workers.every(worker => worker.terminated)).toBe(true);
  });

  for (const failure of ["construction", "error", "malformed", "timeout"] as const) {
    it(`retries the complete stage serially after ${failure} and disables failed helpers`, async () => {
      const workers: FakeWorker[] = [], failures: unknown[] = [];
      const original = structuredClone(batch);
      let attempts = 0;
      const pool = new GeometryTaskPool(() => {
        attempts++;
        if (failure === "construction") throw new Error("blocked");
        const worker = new FakeWorker((message, target) => {
          if (failure === "timeout") return;
          queueMicrotask(() => {
            if (message.type === "configure") target.reply({ type: "ready", batchId: message.batchId });
            else if (failure === "error") target.onerror?.({ message: "crash" } as ErrorEvent);
            else target.reply({ type: "result", batchId: message.batchId, requestId: message.requestId, results: [] });
          });
        });
        workers.push(worker); return worker;
      }, 2, 20, error => failures.push(error));
      try {
        expect(await pool.run(batch, new AbortController().signal)).toEqual(expected());
        const previousAttempts = attempts;
        expect(await pool.run(batch, new AbortController().signal)).toEqual(expected());
        expect(attempts).toBe(previousAttempts);
        expect(failures).toHaveLength(1);
        expect(workers.every(worker => worker.terminated)).toBe(true);
        expect(batch).toEqual(original);
      } finally { pool.dispose(); }
    });
  }

  it("aborts in-flight tasks without falling back and can start a fresh batch", async () => {
    const workers: FakeWorker[] = [], failures: unknown[] = [];
    const pool = new GeometryTaskPool(() => { const worker = new FakeWorker(); workers.push(worker); return worker; }, 2, 1000, error => failures.push(error));
    const controller = new AbortController();
    const pending = pool.run(batch, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(workers.every(worker => worker.terminated)).toBe(true);
    expect(failures).toEqual([]);
    expect(await pool.run(batch, new AbortController().signal)).toHaveLength(9);
    expect(workers).toHaveLength(4);
    pool.dispose();
  });

  it("rejects overlap and disposal without retrying", async () => {
    const pool = new GeometryTaskPool(() => new FakeWorker(() => undefined), 1);
    const pending = pool.run(batch, new AbortController().signal);
    await expect(pool.run(batch, new AbortController().signal)).rejects.toThrow("already running");
    pool.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await expect(pool.run(batch, new AbortController().signal)).rejects.toMatchObject({ name: "AbortError" });
  });

  it("cancels serial fallback between chunks", async () => {
    const controller = new AbortController();
    const pool = new GeometryTaskPool(() => { throw new Error("unexpected"); }, 0);
    await expect(pool.run(batch, controller.signal, () => controller.abort())).rejects.toMatchObject({ name: "AbortError" });
    pool.dispose();
  });

  it("reserves CPU capacity", () => {
    expect([1, 2, 4, 16, undefined, NaN].map(geometryWorkerCount)).toEqual([0, 1, 3, 4, 1, 1]);
  });
});
