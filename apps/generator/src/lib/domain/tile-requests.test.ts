import { describe, expect, it, vi } from "vitest";
import { mapTiles } from "$lib/domain/tile-requests";

describe("bounded tile requests", () => {
  it("limits active work and preserves input order despite out-of-order completion", async () => {
    const release = new Map<number, () => void>();
    let active = 0, peak = 0;
    const pending = mapTiles(Array.from({ length: 12 }, (_, i) => i), async (i) => {
      active += 1; peak = Math.max(peak, active);
      await new Promise<void>((resolve) => release.set(i, resolve));
      active -= 1;
      return i * 2;
    });
    expect(release.size).toBe(6);
    for (const index of [5, 4, 3, 2, 1, 0]) release.get(index)!();
    await vi.waitFor(() => expect(release.size).toBe(12));
    for (const index of [11, 10, 9, 8, 7, 6]) release.get(index)!();
    expect(await pending).toEqual(Array.from({ length: 12 }, (_, i) => i * 2));
    expect(peak).toBe(6);
  });
  it("aborts active siblings and never starts queued work after failure", async () => {
    const failure = new Error("bad tile");
    let rejectFirst!: (error: Error) => void;
    const started: number[] = [], canceled: number[] = [];
    const pending = mapTiles(Array.from({ length: 24 }, (_, i) => i), (i, signal) => {
      started.push(i);
      return new Promise((resolve, reject) => {
        if (i === 0) rejectFirst = reject;
        signal.addEventListener("abort", () => { canceled.push(i); reject(signal.reason); }, { once: true });
      });
    });
    const rejected = expect(pending).rejects.toBe(failure);
    rejectFirst(failure);
    await rejected;
    expect(started).toHaveLength(6);
    expect(canceled).toHaveLength(6);
  });
  it("does no work after user cancellation and allows a fresh retry", async () => {
    const controller = new AbortController(); controller.abort();
    const load = vi.fn(async (i: number) => i);
    await expect(mapTiles([1], load, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(load).not.toHaveBeenCalled();
    expect(await mapTiles([1], load)).toEqual([1]);
  });
});
