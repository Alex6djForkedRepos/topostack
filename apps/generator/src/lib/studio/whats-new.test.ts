import { describe, expect, it } from "vitest";
import { CHANGELOG_SEEN_KEY, hasUnseenRelease, markReleaseSeen } from "$lib/studio/whats-new";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
}

describe("what's new marker", () => {
  it("records the current release silently on a first visit", () => {
    const storage = memoryStorage();
    expect(hasUnseenRelease(storage, "0.2.0")).toBe(false);
    expect(storage.values.get(CHANGELOG_SEEN_KEY)).toBe("0.2.0");
  });

  it("marks a newer release until it is seen", () => {
    const storage = memoryStorage({ [CHANGELOG_SEEN_KEY]: "0.1.2" });
    expect(hasUnseenRelease(storage, "0.2.0")).toBe(true);
    markReleaseSeen(storage, "0.2.0");
    expect(hasUnseenRelease(storage, "0.2.0")).toBe(false);
  });

  it("stays quiet when storage is unavailable", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(hasUnseenRelease(blocked, "0.2.0")).toBe(false);
    expect(() => markReleaseSeen(blocked, "0.2.0")).not.toThrow();
  });
});
