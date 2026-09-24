import { mount, tick, unmount } from "svelte";
import { describe, expect, it, vi } from "vitest";
import StudioNumberField from "$lib/studio/StudioNumberField.svelte";

describe("embedded numeric fields", () => {
  it("keeps invalid drafts visible and never commits them, including on blur", async () => {
    const target = document.createElement("div");
    const values: number[] = [];
    const commit = vi.fn();
    const component = mount(StudioNumberField, {
      target, context: new Map([["atomm-embedded", () => true]]),
      props: { label: "Depth", value: 2, min: 0.25, max: 4, "aria-describedby": "depth-hint", oninput: event => values.push(event.currentTarget.valueAsNumber), onValueChange: commit },
    });
    await tick();
    const field = target.querySelector("input")!;
    for (const value of ["999", "-2", ""]) {
      field.value = value;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new FocusEvent("blur"));
      await tick();
      expect(field.value).toBe(value);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      const error = target.querySelector(".atomm-number-error")!;
      expect(error.textContent).toMatch(/Use|Enter/);
      expect(field.getAttribute("aria-describedby")).toBe(`depth-hint ${error.id}`);
    }
    expect(values).toEqual([]);
    expect(commit).not.toHaveBeenCalled();
    field.value = "1.5";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    expect(values).toEqual([1.5]);
    expect(field.hasAttribute("aria-invalid")).toBe(false);
    expect(field.getAttribute("aria-describedby")).toBe("depth-hint");
    field.dispatchEvent(new FocusEvent("blur"));
    expect(commit).toHaveBeenLastCalledWith(1.5);
    await unmount(component);
  });
});
