import { mount, tick, unmount } from "svelte";
import { describe, expect, it, vi } from "vitest";
import StudioNumberField from "$lib/studio/StudioNumberField.svelte";

describe("embedded numeric fields", () => {
  it("bounds custom input callbacks and restores cleared or invalid values on blur", async () => {
    const target = document.createElement("div");
    const values: number[] = [];
    const commit = vi.fn();
    const component = mount(StudioNumberField, {
      target, context: new Map([["atomm-embedded", () => true]]),
      props: { label: "Depth", value: 2, min: 0.25, max: 4, oninput: event => values.push(event.currentTarget.valueAsNumber), onValueChange: commit },
    });
    await tick();
    const field = target.querySelector("input")!;
    for (const value of ["999", "-2", "", "invalid", "1.5"]) {
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
    }
    expect(values).toEqual([4, 0.25, 1.5]);
    field.value = "";
    field.dispatchEvent(new FocusEvent("blur"));
    expect(field.value).toBe("2");
    expect(commit).toHaveBeenLastCalledWith(2);
    await unmount(component);
  });
});
