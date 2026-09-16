import { describe, expect, it, vi } from "vitest";
import { createSyntheticSource, DEFAULT_PROJECT, type GeometryIRV1, type SourceBundleV1 } from "@topostack/core";
import { GeometryWorkerClient, type GeometryWorkerRequest, type GeometryWorkerResponse } from "./geometry-worker-client";
import { PreviewPipeline } from "./preview-pipeline";

class FakeWorker {
  onmessage: ((event: { data: GeometryWorkerResponse }) => void) | null = null;
  onerror: ((event: { message: string; preventDefault?: () => void }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  posted: GeometryWorkerRequest[] = [];
  terminated = false;
  postMessage(message: GeometryWorkerRequest): void { this.posted.push(message); }
  terminate(): void { this.terminated = true; }
  reply(data: GeometryWorkerResponse): void { this.onmessage?.({ data }); }
  get last(): GeometryWorkerRequest { return this.posted.at(-1)!; }
}

const geometry = (name: string) => ({ projectName: name }) as unknown as GeometryIRV1;
const source = (): SourceBundleV1 => createSyntheticSource(DEFAULT_PROJECT, 8);

function setup(generate = vi.fn(() => geometry("sync"))) {
  const workers: FakeWorker[] = [];
  const factory = vi.fn(() => { const worker = new FakeWorker(); workers.push(worker); return worker as unknown as Worker; });
  return { client: new GeometryWorkerClient(factory, generate), workers, factory, generate };
}

describe("geometry worker client", () => {
  it("keeps one worker and posts an unchanged source only once", async () => {
    const { client, workers, factory } = setup();
    const bundle = source();
    const first = client.run(DEFAULT_PROJECT, bundle);
    expect(workers[0]!.last.source).toBe(bundle);
    workers[0]!.reply({ id: workers[0]!.last.id, result: geometry("first") });
    await expect(first).resolves.toMatchObject({ projectName: "first" });

    const second = client.run({ ...DEFAULT_PROJECT, materialThicknessMm: 6 }, bundle);
    expect(workers[0]!.last.source).toBeUndefined();
    expect(workers[0]!.last.config.materialThicknessMm).toBe(6);
    workers[0]!.reply({ id: workers[0]!.last.id, result: geometry("second") });
    await expect(second).resolves.toMatchObject({ projectName: "second" });
    expect(factory).toHaveBeenCalledOnce();
    expect(workers[0]!.terminated).toBe(false);
  });

  it("resends the source when the worker reports it missing", async () => {
    const { client, workers } = setup();
    const bundle = source();
    const first = client.run(DEFAULT_PROJECT, bundle);
    workers[0]!.reply({ id: workers[0]!.last.id, result: geometry("first") });
    await first;
    const pending = client.run(DEFAULT_PROJECT, bundle);
    const { id } = workers[0]!.last;
    workers[0]!.reply({ id, missingSource: true });
    expect(workers[0]!.last).toMatchObject({ id, source: bundle });
    workers[0]!.reply({ id, result: geometry("resent") });
    await expect(pending).resolves.toMatchObject({ projectName: "resent" });
  });

  it("terminates only an in-flight worker on cancel and rejects with an AbortError", async () => {
    const { client, workers } = setup();
    const bundle = source();
    const idle = client.run(DEFAULT_PROJECT, bundle);
    workers[0]!.reply({ id: workers[0]!.last.id, result: geometry("done") });
    await idle;
    client.cancel();
    expect(workers[0]!.terminated).toBe(false);

    const pending = client.run(DEFAULT_PROJECT, bundle);
    client.cancel();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(workers[0]!.terminated).toBe(true);
    expect(client.busy).toBe(false);

    // The replacement worker has no cached source.
    void client.run(DEFAULT_PROJECT, bundle).catch(() => undefined);
    expect(workers).toHaveLength(2);
    expect(workers[1]!.last.source).toBe(bundle);
    client.dispose();
    expect(workers[1]!.terminated).toBe(true);
  });

  it("rejects generation errors without discarding a working worker", async () => {
    const { client, workers } = setup();
    const ok = client.run(DEFAULT_PROJECT, source());
    workers[0]!.reply({ id: workers[0]!.last.id, result: geometry("ok") });
    await ok;
    const failing = client.run(DEFAULT_PROJECT, source());
    workers[0]!.reply({ id: workers[0]!.last.id, error: "Contours failed" });
    await expect(failing).rejects.toThrow("Contours failed");
    expect(workers[0]!.terminated).toBe(false);
  });

  it("ignores late replies from a superseded request or replaced worker", async () => {
    const { client, workers } = setup();
    const bundle = source();
    const stale = client.run(DEFAULT_PROJECT, bundle).catch((error: unknown) => error);
    const staleId = workers[0]!.last.id;
    const staleHandler = workers[0]!.onmessage!;
    const current = client.run({ ...DEFAULT_PROJECT, name: "current" }, bundle);
    expect(await stale).toMatchObject({ name: "AbortError" });
    // A message already queued on the terminated worker still arrives.
    staleHandler({ data: { id: staleId, result: geometry("stale") } });
    expect(client.busy).toBe(true);
    workers[1]!.reply({ id: staleId, result: geometry("wrong id") });
    expect(client.busy).toBe(true);
    workers[1]!.reply({ id: workers[1]!.last.id, result: geometry("current") });
    await expect(current).resolves.toMatchObject({ projectName: "current" });
  });

  it("falls back to main-thread generation when the worker cannot be constructed", async () => {
    const generate = vi.fn(() => geometry("sync"));
    const factory = vi.fn(() => { throw new DOMException("Blocked by CSP", "SecurityError"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = new GeometryWorkerClient(factory, generate);
    await expect(client.run(DEFAULT_PROJECT, source())).resolves.toMatchObject({ projectName: "sync" });
    await expect(client.run(DEFAULT_PROJECT, source())).resolves.toMatchObject({ projectName: "sync" });
    expect(factory).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it("finishes on the main thread when a worker fails before ever answering", async () => {
    const { client, workers, generate } = setup();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pending = client.run(DEFAULT_PROJECT, source());
    workers[0]!.onerror!({ message: "Failed to load worker script" });
    await expect(pending).resolves.toMatchObject({ projectName: "sync" });
    expect(workers[0]!.terminated).toBe(true);
    expect(generate).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("rejects and replaces a proven worker after a runtime or deserialization error", async () => {
    const { client, workers } = setup();
    const first = client.run(DEFAULT_PROJECT, source());
    workers[0]!.reply({ id: workers[0]!.last.id, result: geometry("ok") });
    await first;
    const crashed = client.run(DEFAULT_PROJECT, source());
    workers[0]!.onerror!({ message: "Out of memory" });
    await expect(crashed).rejects.toThrow("Out of memory");
    const unreadable = client.run(DEFAULT_PROJECT, source());
    expect(workers).toHaveLength(2);
    workers[1]!.reply({ id: workers[1]!.last.id, result: geometry("ok") });
    await unreadable;
    const next = client.run(DEFAULT_PROJECT, source());
    workers[1]!.onmessageerror!();
    await expect(next).rejects.toThrow("unreadable");
    expect(workers[1]!.terminated).toBe(true);
  });
});

describe("preview pipeline", () => {
  const update = (overrides: Partial<Parameters<PreviewPipeline["runPreviewUpdate"]>[0]> = {}) => ({
    config: DEFAULT_PROJECT,
    prepareSource: vi.fn(async () => source()),
    onCommit: vi.fn(),
    onError: vi.fn(),
    onSettled: vi.fn(),
    ...overrides,
  });

  it("coalesces edits made during the trailing delay", async () => {
    vi.useFakeTimers();
    try {
      const pipeline = new PreviewPipeline(async () => new GeometryWorkerClient(undefined, () => geometry("sync")));
      const first = update();
      const firstRun = pipeline.runPreviewUpdate(first, 120);
      pipeline.invalidate();
      const second = update();
      const secondRun = pipeline.runPreviewUpdate(second, 120);
      await vi.advanceTimersByTimeAsync(120);
      await Promise.all([firstRun, secondRun]);
      expect(first.prepareSource).not.toHaveBeenCalled();
      expect(second.onCommit).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it("never commits a refresh superseded while loading data, and aborts its signal", async () => {
    const pipeline = new PreviewPipeline(async () => setup().client);
    let signal: AbortSignal | undefined;
    let finish: (() => void) | undefined;
    const stale = update({ prepareSource: vi.fn((abort: AbortSignal) => { signal = abort; return new Promise<SourceBundleV1>((resolve) => { finish = () => resolve(source()); }); }) });
    const run = pipeline.runPreviewUpdate(stale);
    await Promise.resolve();
    pipeline.invalidate();
    expect(signal?.aborted).toBe(true);
    finish!();
    await run;
    expect(stale.onCommit).not.toHaveBeenCalled();
    expect(stale.onError).not.toHaveBeenCalled();
    expect(stale.onSettled).toHaveBeenCalledWith(false);
  });

  it("reports failures of the current refresh", async () => {
    const failing = update();
    const syncPipeline = new PreviewPipeline(async () => new GeometryWorkerClient(undefined, () => { throw new Error("Bad geometry"); }));
    await syncPipeline.runPreviewUpdate(failing);
    expect(failing.onError).toHaveBeenCalledWith(expect.objectContaining({ message: "Bad geometry" }));
    expect(failing.onSettled).toHaveBeenCalledWith(true);
    syncPipeline.dispose();
  });
});
