import { mount, tick, unmount } from "svelte";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT, type ProjectConfigV1 } from "@topostack/core";
import ExportDialog from "$lib/studio/ExportDialog.svelte";

describe("ExportDialog", () => {
  let component: ReturnType<typeof mount> | undefined;
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function () { this.open = true; };
    HTMLDialogElement.prototype.close ??= function () { this.open = false; this.dispatchEvent(new Event("close")); };
  });
  afterEach(async () => { if (component) await unmount(component); component = undefined; });

  async function render(project: Partial<ProjectConfigV1> = {}, props: { blockedReason?: string; panelCount?: number } = {}) {
    const onDownload = vi.fn();
    const target = document.createElement("div");
    component = mount(ExportDialog, { target, props: {
      open: true, project: { ...DEFAULT_PROJECT, ...project }, summary: "12 layers · 9 cut panels", panelCount: props.panelCount ?? 9,
      blockedReason: props.blockedReason, preparing: false, phase: "idle", title: "", detail: "",
      onDownload, onClose: () => undefined,
    } });
    await tick();
    const button = (name: string) => [...target.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.querySelector("strong")?.textContent === name);
    const rows = () => [...target.querySelectorAll(".export-more .export-row strong")].map((node) => node.textContent);
    return { target, onDownload, button, rows };
  }

  it("leads layered projects with the complete project and lists specialist files behind a disclosure", async () => {
    const { target, onDownload, button, rows } = await render({ outputMode: "stack", paintTemplates: [] });
    expect(target.querySelector(".export-hero")?.textContent).toContain("Complete project");
    expect(target.querySelector(".export-hero")?.textContent).toContain("9 panels");
    expect(target.textContent).toContain("Crater Lake · 12 layers · 9 cut panels");
    expect(target.querySelector<HTMLDetailsElement>(".export-more")?.open).toBe(false);
    expect(rows()).toEqual(["Master SVG", "Cut panels", "Engraving panels", "Paint templates", "Assembly guide"]);
    expect(button("Paint templates")?.disabled).toBe(true);
    button("Complete project")!.click();
    button("Cut panels")!.click();
    expect(onDownload.mock.calls).toEqual([["all"], ["panels"]]);
  });

  it("offers only the engraving artwork for flat engravings", async () => {
    const { target, rows } = await render({ outputMode: "engraving" });
    expect(rows()).toEqual(["Engraving SVG"]);
    expect(target.querySelector(".export-hero")?.textContent).toContain("engraving SVG");
  });

  it("keeps project settings available when artwork export is blocked", async () => {
    const { target, onDownload, button } = await render({}, { blockedReason: "Generate real terrain first." });
    expect(target.querySelector("#export-blocked-reason")?.textContent).toContain("Generate real terrain first.");
    expect(button("Complete project")?.disabled).toBe(true);
    expect(button("Master SVG")?.disabled).toBe(true);
    button("Project settings")!.click();
    expect(onDownload).toHaveBeenCalledWith("project");
  });
});
