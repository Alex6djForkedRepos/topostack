import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT } from "@topostack/core";

const store = vi.hoisted(() => new Map<string, unknown>());
const failWrites = vi.hoisted(() => ({ enabled: false }));
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (key: string) => store.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { if (failWrites.enabled) throw new Error("Quota exceeded"); store.set(key, value); }),
}));

import { loadProject, PROJECT_BACKUP_KEY, UnreadableSavedProjectError } from "./storage";

describe("saved project restore", () => {
  afterEach(() => { store.clear(); failWrites.enabled = false; vi.restoreAllMocks(); });

  it("restores a valid saved project and returns nothing when none is saved", async () => {
    await expect(loadProject()).resolves.toBeUndefined();
    store.set("topostack:project:v1", { ...DEFAULT_PROJECT, name: "Saved" });
    await expect(loadProject()).resolves.toMatchObject({ name: "Saved" });
  });

  it("backs up an unparseable saved project before reporting it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const raw = { ...DEFAULT_PROJECT, widthMm: "wide" };
    store.set("topostack:project:v1", raw);
    const error = await loadProject().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(UnreadableSavedProjectError);
    expect((error as UnreadableSavedProjectError).backupKey).toBe(PROJECT_BACKUP_KEY);
    expect(store.get(PROJECT_BACKUP_KEY)).toMatchObject({ value: raw });
    // The original stays in place until the next autosave.
    expect(store.get("topostack:project:v1")).toBe(raw);
  });

  it("reports a missing backup so autosave can stay paused", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    store.set("topostack:project:v1", { schemaVersion: 99 });
    failWrites.enabled = true;
    const error = await loadProject().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(UnreadableSavedProjectError);
    expect((error as UnreadableSavedProjectError).backupKey).toBeUndefined();
  });
});
