import { describe, expect, it, vi } from "vitest";
import { ModuleLoadError, retryingLoader } from "$lib/studio/lazy-load";

describe("retrying chunk loader", () => {
  it("shares one successful load", async () => {
    const load = vi.fn(async () => "module");
    const loader = retryingLoader(load, "Map data");
    await expect(loader()).resolves.toBe("module");
    await expect(loader()).resolves.toBe("module");
    expect(load).toHaveBeenCalledOnce();
  });

  it("forgets a failed load so the next call imports again, reporting a reload hint", async () => {
    const load = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module")).mockResolvedValue("module");
    const loader = retryingLoader(load, "Map data");
    const failure = await loader().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ModuleLoadError);
    expect((failure as Error).message).toBe("Map data could not load · reload to update TopoStack");
    await expect(loader()).resolves.toBe("module");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
