import { describe, expect, it, vi } from "vitest";
import { LazyComponent } from "./lazy-component";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("lazy component", () => {
  it("loads once and exposes the component", async () => {
    const importer = vi.fn(async () => ({ default: "Preview" }));
    const lazy = new LazyComponent(importer);
    lazy.ensure(); lazy.ensure();
    await flush();
    lazy.ensure(); lazy.load();
    expect(lazy.component).toBe("Preview");
    expect(importer).toHaveBeenCalledOnce();
  });

  it("remembers a failure for ensure and retries on an explicit load", async () => {
    const onError = vi.fn();
    const importer = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch dynamically imported module")).mockResolvedValue({ default: "Preview" });
    const lazy = new LazyComponent(importer, onError);
    lazy.ensure();
    await flush();
    expect(lazy.failed).toBe(true);
    expect(onError).toHaveBeenCalledOnce();
    lazy.ensure();
    await flush();
    expect(importer).toHaveBeenCalledOnce();
    lazy.load();
    expect(lazy.failed).toBe(false);
    await flush();
    expect(lazy.component).toBe("Preview");
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
