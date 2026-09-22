import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import FeedbackDialog from "$lib/site/FeedbackDialog.svelte";

beforeAll(() => {
  // jsdom lacks the modal dialog API.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.open = true; };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event("close")); };
});

let component: ReturnType<typeof mount> | undefined;
afterEach(() => { if (component) void unmount(component); component = undefined; document.body.innerHTML = ""; vi.unstubAllGlobals(); });

function render(context?: Record<string, unknown>) {
  component = mount(FeedbackDialog, { target: document.body, props: { open: true, initialType: "terrain", context, onClose: () => undefined } });
  flushSync();
  const dialog = document.querySelector("dialog")!;
  const field = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const type = (element: HTMLInputElement | HTMLTextAreaElement, value: string) => { element.value = value; element.dispatchEvent(new Event("input", { bubbles: true })); flushSync(); };
  return { dialog, field, type };
}

const settle = async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); flushSync(); };

describe("FeedbackDialog", () => {
  it("emails the report without an account and confirms delivery", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetch);
    const { dialog, field, type } = render({ lakeCount: 3 });
    const submit = field<HTMLButtonElement>("button[type=submit]");
    expect(submit.disabled).toBe(true);
    expect(dialog.textContent).toContain("No account needed");
    type(field<HTMLInputElement>("input[placeholder='A short description']"), "Coarse ridge");
    type(field<HTMLTextAreaElement>("textarea[required]"), "The ridge near the lake is blocky.");
    type(field<HTMLInputElement>("input[type=email]"), "not-an-email");
    expect(submit.disabled).toBe(true);
    type(field<HTMLInputElement>("input[type=email]"), "maker@example.com");
    field<HTMLInputElement>("input[type=checkbox]").click();
    flushSync();
    expect(submit.disabled).toBe(false);
    field<HTMLFormElement>("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/v1/feedback");
    expect(JSON.parse(init.body as string)).toEqual({ kind: "terrain", summary: "Coarse ridge", details: "The ridge near the lake is blocky.", replyTo: "maker@example.com", context: { lakeCount: 3 } });
    expect(dialog.querySelector("[role=status]")?.textContent).toContain("Thanks!");
  });

  it("keeps the draft and offers GitHub when sending fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 502 })));
    const { dialog, field, type } = render();
    type(field<HTMLInputElement>("input[placeholder='A short description']"), "Broken");
    type(field<HTMLTextAreaElement>("textarea[required]"), "Details");
    field<HTMLFormElement>("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle();
    const alert = dialog.querySelector("[role=alert]")!;
    expect(alert.textContent).toContain("could not be sent");
    expect(alert.querySelector("a")!.getAttribute("href")).toContain("github.com/Echo-Foxtrot-Works/topostack/issues/new");
    expect(field<HTMLInputElement>("input[placeholder='A short description']").value).toBe("Broken");
  });
});
