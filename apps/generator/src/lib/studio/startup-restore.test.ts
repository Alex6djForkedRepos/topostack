import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PROJECT, type ProjectConfigV1 } from "@topostack/core";
import { UnreadableSavedProjectError } from "$lib/storage/storage";
import { restoreStartupProject, type StartupRestoreHost } from "$lib/studio/startup-restore";

function host(overrides: Partial<StartupRestoreHost> = {}) {
  let project: ProjectConfigV1 = DEFAULT_PROJECT;
  const statuses: string[] = [];
  const loadProject = vi.fn<() => Promise<ProjectConfigV1 | undefined>>(async () => undefined);
  const value = {
    loadProject,
    search: "",
    loadLakeLocation: () => import("$lib/site/lake-location"),
    consumeLakeLink: vi.fn(async () => undefined),
    isCancelled: () => false,
    currentProject: () => project,
    restoreSaved: vi.fn((saved: ProjectConfigV1) => { project = saved; }),
    openLinkedLake: vi.fn((next: ProjectConfigV1) => { project = next; }),
    setStatus: (message: string) => { statuses.push(message); },
    ...overrides,
  };
  return { value, loadProject, statuses, project: () => project };
}

describe("startup restore", () => {
  it("restores the saved project, then opens a directory lake on top of it", async () => {
    const { value, loadProject, statuses, project } = host({ search: "?lake=Crater%20Lake&bounds=-122.2,42.9,-122.0,43.0" });
    loadProject.mockResolvedValueOnce({ ...DEFAULT_PROJECT, materialThicknessMm: 5 });
    await expect(restoreStartupProject(value)).resolves.toEqual({ autosave: true });
    expect(value.restoreSaved).toHaveBeenCalledOnce();
    expect(value.consumeLakeLink).toHaveBeenCalledOnce();
    expect(project()).toMatchObject({ name: "Crater Lake", materialThicknessMm: 5, outputMode: "stack", showWaterDepth: true });
    expect(value.openLinkedLake).toHaveBeenCalledWith(project(), expect.objectContaining({ name: DEFAULT_PROJECT.name }));
    expect(statuses.at(-1)).toContain("Lake selected");
  });

  it("keeps autosave running when an unreadable project was backed up, and still opens the link", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { value, loadProject, statuses } = host({ search: "?lake=Crater%20Lake&bounds=-122.2,42.9,-122.0,43.0" });
    loadProject.mockRejectedValueOnce(new UnreadableSavedProjectError("backup", new Error("bad")));
    await expect(restoreStartupProject(value)).resolves.toEqual({ autosave: true });
    expect(statuses[0]).toContain("backup copy was kept");
    expect(value.openLinkedLake).toHaveBeenCalledOnce();
    errors.mockRestore();
  });

  it("pauses autosave when an unreadable project could not be backed up", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { value, loadProject, statuses } = host();
    loadProject.mockRejectedValueOnce(new UnreadableSavedProjectError(undefined, new Error("quota")));
    await expect(restoreStartupProject(value)).resolves.toEqual({ autosave: false });
    expect(statuses[0]).toContain("autosave paused");
    errors.mockRestore();
  });

  it("reports other restore failures and stops once cancelled", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const failing = host();
    failing.loadProject.mockRejectedValueOnce(new Error("IndexedDB blocked"));
    await expect(restoreStartupProject(failing.value)).resolves.toEqual({ autosave: true });
    expect(failing.statuses).toEqual(["Saved project could not be restored · starting from the sample preview"]);
    const cancelled = host({ isCancelled: () => true });
    cancelled.loadProject.mockResolvedValueOnce(DEFAULT_PROJECT);
    await restoreStartupProject(cancelled.value);
    expect(cancelled.value.restoreSaved).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
