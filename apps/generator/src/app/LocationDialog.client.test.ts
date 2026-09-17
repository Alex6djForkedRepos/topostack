import { mount, tick, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT } from "@topostack/core";
import { resetLocationLakes } from "./lake-directory-cache";
import LocationDialog from "./LocationDialog.svelte";

const directory = {
  schemaVersion: 1,
  updated: "2026-01-01",
  sources: [{ id: "src", name: "Survey", url: "https://example.test", license: "CC-BY", kind: "grid", region: "Test", group: "test" }],
  lakes: [{ id: "lake-1", name: "Test Lake", sourceId: "src", surveyId: "1", region: "Test", bounds: [-1, -1, 1, 1] }],
};

describe("location dialog", () => {
  let component: ReturnType<typeof mount> | undefined;

  beforeAll(() => {
    // jsdom does not implement modal dialogs.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); };
  });
  afterEach(async () => {
    if (component) await unmount(component);
    component = undefined;
    document.body.replaceChildren();
    resetLocationLakes();
    vi.unstubAllGlobals();
  });

  const open = (onCoordinates = vi.fn()) => {
    const target = document.createElement("div");
    document.body.append(target);
    component = mount(LocationDialog, { target, props: { project: DEFAULT_PROJECT, presets: [], onChoose: vi.fn(), onCoordinates, onClose: vi.fn() } });
    return target;
  };

  it("commits typed coordinates on change instead of every keystroke", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(directory))));
    const onCoordinates = vi.fn();
    const target = open(onCoordinates);
    await tick();
    const latitude = target.querySelector<HTMLInputElement>('input[aria-label="Latitude"]')!;
    for (const partial of ["4", "42", "42.9"]) {
      latitude.value = partial;
      latitude.dispatchEvent(new Event("input", { bubbles: true }));
      await tick();
    }
    expect(onCoordinates).not.toHaveBeenCalled();
    latitude.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(onCoordinates).toHaveBeenCalledOnce();
    expect(onCoordinates).toHaveBeenCalledWith(42.9, DEFAULT_PROJECT.location.lon);

    const longitude = target.querySelector<HTMLInputElement>('input[aria-label="Longitude"]')!;
    longitude.value = "-200";
    longitude.dispatchEvent(new Event("input", { bubbles: true }));
    longitude.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(onCoordinates).toHaveBeenLastCalledWith(DEFAULT_PROJECT.location.lat, -180);
  });

  it("loads the surveyed lake directory once across dialog opens and retries after a failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockImplementation(async () => new Response(JSON.stringify(directory)));
    vi.stubGlobal("fetch", fetchMock);
    let target = open();
    await vi.waitFor(() => expect(target.textContent).toContain("The surveyed lake list could not load."));
    [...target.querySelectorAll("button")].find((button) => button.textContent?.includes("Retry lake search"))!.click();
    await vi.waitFor(() => expect(target.querySelector('[data-lake-id="lake-1"]')).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await unmount(component!);
    target = open();
    await vi.waitFor(() => expect(target.querySelector('[data-lake-id="lake-1"]')).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
