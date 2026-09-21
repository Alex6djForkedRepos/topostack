export type HistoryShortcut = "undo" | "redo";

type ShortcutEvent = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented" | "target">;

// Text fields keep their native undo, and dialogs own their keyboard, so the
// project-level shortcut only fires from the rest of the studio.
function ownsKeyboard(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), dialog, [role='dialog']") !== null;
}

export function historyShortcut(event: ShortcutEvent): HistoryShortcut | undefined {
  if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey) || ownsKeyboard(event.target)) return undefined;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) return "redo";
  return undefined;
}
