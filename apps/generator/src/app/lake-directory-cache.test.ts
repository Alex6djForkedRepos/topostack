import { afterEach, describe, expect, it, vi } from "vitest";
import { loadLocationLakes, resetLocationLakes } from "./lake-directory-cache";

const directory = {
  schemaVersion: 1,
  updated: "2026-01-01",
  sources: [{ id: "src", name: "Survey", url: "https://example.test", license: "CC-BY", kind: "grid", region: "Test", group: "test" }],
  lakes: [{ id: "lake-1", name: "Test Lake", sourceId: "src", surveyId: "1", region: "Test", bounds: [-1, -1, 1, 1] }],
};

describe("location lake directory cache", () => {
  afterEach(() => { resetLocationLakes(); vi.unstubAllGlobals(); });

  it("fetches and indexes the directory once for repeated dialog opens", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(directory)));
    vi.stubGlobal("fetch", fetchMock);
    const first = await loadLocationLakes();
    const second = await loadLocationLakes();
    expect(first.map((lake) => lake.id)).toEqual(["lake-1"]);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("forgets a failed load so retry fetches again", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...directory, schemaVersion: 2 })))
      .mockResolvedValueOnce(new Response(JSON.stringify(directory)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadLocationLakes()).rejects.toThrow("Lake directory unavailable");
    await expect(loadLocationLakes()).rejects.toThrow("Invalid lake directory");
    await expect(loadLocationLakes()).resolves.toHaveLength(1);
    await loadLocationLakes();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
