import { afterEach, describe, expect, it, vi } from "vitest";
import { createSyntheticSource, DEFAULT_PROJECT, generateGeometry } from "@topostack/core";
import { describeExport, downloadProject, ExportNotice } from "./export-notice";

vi.mock("./native-export", () => ({
  prepareProjectSettings: vi.fn(() => ({ fileCount: 1 })),
  prepareSelectedDownload: vi.fn(async () => ({ fileCount: 3 })),
  startBrowserDownload: vi.fn(),
}));

afterEach(() => { vi.useRealTimers(); });

describe("export notice", () => {
  it("describes browser and Studio exports", () => {
    expect(describeExport({ phase: "preparing", intent: "openInStudio" })).toMatchObject({ title: "Preparing Studio artwork", status: "Preparing Studio artwork" });
    expect(describeExport({ phase: "ready", intent: "download", fileCount: 1 })).toMatchObject({ title: "Download ready", status: "Download started · 1 file" });
    expect(describeExport({ phase: "error", intent: "download", message: "Nope" })).toEqual({ title: "Export failed", detail: "Nope", status: "Nope" });
  });

  it("reports status and returns to idle after a finished export", () => {
    vi.useFakeTimers();
    const statuses: string[] = [];
    const notice = new ExportNotice((status) => statuses.push(status), 1_000);
    notice.apply({ phase: "preparing", intent: "download" });
    vi.advanceTimersByTime(5_000);
    expect(notice.phase).toBe("preparing");
    notice.apply({ phase: "ready", intent: "download", fileCount: 2 });
    expect(notice).toMatchObject({ phase: "ready", title: "Download ready" });
    vi.advanceTimersByTime(1_000);
    expect(notice.phase).toBe("idle");
    expect(statuses).toEqual(["Building your download", "Download started · 2 files"]);
  });

  it("blocks sample-data exports but always allows project settings", async () => {
    const project = DEFAULT_PROJECT;
    const geometry = generateGeometry(project, createSyntheticSource(project, 16));
    const notice = new ExportNotice(() => undefined);
    const track = vi.fn();
    await downloadProject({ option: "all", geometry, project, notice, track, nextFrame: async () => undefined });
    expect(notice.phase).toBe("error");
    expect(track).toHaveBeenCalledWith("export_failed");
    track.mockClear();
    await downloadProject({ option: "project", geometry, project, notice, track, nextFrame: async () => undefined });
    expect(notice).toMatchObject({ phase: "ready", detail: expect.stringContaining("1 file") });
    expect(track).not.toHaveBeenCalled();
    notice.dispose();
  });
});
