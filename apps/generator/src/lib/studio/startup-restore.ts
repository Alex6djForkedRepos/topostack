import { MAX_PROJECT_NAME_LENGTH, type ProjectConfigV1 } from "@topostack/core";
import { UnreadableSavedProjectError } from "$lib/storage/storage";

export interface StartupRestoreHost {
  loadProject: () => Promise<ProjectConfigV1 | undefined>;
  /** `window.location.search` at startup. */
  search: string;
  loadLakeLocation: () => Promise<typeof import("$lib/site/lake-location")>;
  /** Consumes the `lake` and `bounds` parameters so a refresh restores later edits instead. */
  consumeLakeLink: () => Promise<void>;
  isCancelled: () => boolean;
  currentProject: () => ProjectConfigV1;
  /** Swap in the saved project as the new baseline (no undo into the default project). */
  restoreSaved: (saved: ProjectConfigV1) => void;
  /** Open a directory lake as an undoable change of `previous`. */
  openLinkedLake: (next: ProjectConfigV1, previous: ProjectConfigV1) => void;
  setStatus: (message: string) => void;
}

export interface StartupRestoreResult {
  /** False only when autosave would overwrite an unreadable saved project that could not be backed up. */
  autosave: boolean;
}

/**
 * Restore the autosaved project, then apply a `?lake=` directory link on top of
 * it. A saved project that cannot be read still lets the link open.
 */
export async function restoreStartupProject(host: StartupRestoreHost): Promise<StartupRestoreResult> {
  let autosave = true;
  try {
    let saved: ProjectConfigV1 | undefined;
    try {
      saved = await host.loadProject();
    } catch (error) {
      if (!(error instanceof UnreadableSavedProjectError)) throw error;
      if (host.isCancelled()) return { autosave };
      console.error("TopoStack could not restore the saved project.", error);
      host.setStatus(`${error.message} · starting from the sample preview`);
      autosave = error.backupKey !== undefined;
    }
    if (host.isCancelled()) return { autosave };
    if (saved) {
      host.restoreSaved(saved);
      host.setStatus("Local project restored · generate to refresh terrain");
    }
    if (!new URLSearchParams(host.search).has("lake")) return { autosave };
    const current = host.currentProject();
    const linkedLake = (await host.loadLakeLocation()).lakeLocationFromSearch(host.search, current.widthMm, current.heightMm);
    if (host.isCancelled() || !linkedLake) return { autosave };
    await host.consumeLakeLink();
    if (host.isCancelled()) return { autosave };
    const previous = host.currentProject();
    const next: ProjectConfigV1 = { ...previous, name: linkedLake.label.slice(0, MAX_PROJECT_NAME_LENGTH), location: linkedLake, outputMode: "stack", showWaterDepth: true };
    host.openLinkedLake(next, previous);
    host.setStatus("Lake selected from the depth directory · generate terrain to load survey data");
  } catch (error) {
    if (host.isCancelled()) return { autosave };
    console.error("TopoStack could not restore the saved project.", error);
    host.setStatus("Saved project could not be restored · starting from the sample preview");
  }
  return { autosave };
}
