import { describe, expect, it, vi } from "vitest";
import { readAtommLocale } from "./atomm-locale";

describe("Atomm locale fallback", () => {
  it.each(["en", "en-US", "zh", "ja"])("keeps English copy correctly tagged for %s", async (locale) => {
    const getLocale = vi.fn(async () => locale);
    expect(await readAtommLocale({ app: { getLocale } })).toBe("en");
    expect(getLocale).toHaveBeenCalledOnce();
  });
  it("keeps the studio usable if the platform RPC fails", async () => {
    expect(await readAtommLocale({ app: { getLocale: async () => { throw new Error("Disconnected"); } } })).toBe("en");
  });
});
