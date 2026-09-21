import { describe, expect, it } from "vitest";
import { historyShortcut } from "$lib/studio/history-keys";

const press = (key: string, modifiers: Partial<KeyboardEvent> = {}) => ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, target: null, ...modifiers });

describe("historyShortcut", () => {
  it("maps the platform undo and redo chords", () => {
    expect(historyShortcut(press("z", { metaKey: true }))).toBe("undo");
    expect(historyShortcut(press("z", { ctrlKey: true }))).toBe("undo");
    expect(historyShortcut(press("Z", { metaKey: true, shiftKey: true }))).toBe("redo");
    expect(historyShortcut(press("Z", { ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(historyShortcut(press("y", { ctrlKey: true }))).toBe("redo");
  });

  it("ignores unmodified, alt, handled, and unrelated keys", () => {
    expect(historyShortcut(press("z"))).toBeUndefined();
    expect(historyShortcut(press("z", { ctrlKey: true, altKey: true }))).toBeUndefined();
    expect(historyShortcut(press("z", { ctrlKey: true, defaultPrevented: true }))).toBeUndefined();
    expect(historyShortcut(press("y", { metaKey: true }))).toBeUndefined();
    expect(historyShortcut(press("s", { ctrlKey: true }))).toBeUndefined();
  });
});
