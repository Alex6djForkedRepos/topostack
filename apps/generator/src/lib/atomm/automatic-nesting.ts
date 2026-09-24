import type { GeometryIRV1, ProjectConfigV1, SheetNestPlanV1 } from "@topostack/core";
import type { NestClient } from "$lib/workers/nest-client";

type Runner = typeof import("$lib/studio/sheet-nest-runner");
type Layout = { sheetPlan?: SheetNestPlanV1; layoutNote: string };
export type AutomaticLayout = Layout & { project: ProjectConfigV1 };

/** Export-only defaults; never resize the artwork or guess the machine selected later in Atomm. */
export function automaticNestProject(project: ProjectConfigV1): ProjectConfigV1 {
  return { ...project, sheetNesting: {
    sheetWidthMm: project.workAreaWidthMm > 0 ? project.workAreaWidthMm : 600,
    sheetHeightMm: project.workAreaHeightMm > 0 ? project.workAreaHeightMm : 400,
    marginMm: 3, spacingMm: 2, rotation: "quarter", timeBudgetS: 5, seed: 1,
  } };
}

/** One lazy, bounded search shared by Export Preview, Download and Open in Studio. */
export class AutomaticNesting {
  #runner?: Promise<Runner>;
  #client?: NestClient;
  #sequence = 0;
  #entry?: { geometry: GeometryIRV1; settings: string; promise: Promise<Layout> };
  constructor(private readonly loadRunner: () => Promise<Runner> = () => import("$lib/studio/sheet-nest-runner"), private readonly timeoutMs = 8000) {}

  prepare(geometry: GeometryIRV1, project: ProjectConfigV1): Promise<AutomaticLayout> {
    if (project.outputMode !== "stack") { this.cancel(); return Promise.resolve({ project, layoutNote: "" }); }
    const effective = automaticNestProject(project);
    const settings = JSON.stringify(effective.sheetNesting);
    if (this.#entry?.geometry !== geometry || this.#entry.settings !== settings) {
      this.cancel();
      const sequence = this.#sequence;
      this.#entry = { geometry, settings, promise: this.#run(geometry, effective, sequence) };
    }
    return this.#entry.promise.then(layout => ({ ...layout, project: layout.sheetPlan ? effective : project }));
  }

  cancel(): void { this.#sequence++; this.#entry = undefined; this.#client?.cancel(); }
  dispose(): void { this.cancel(); this.#client?.dispose(); }

  async #run(geometry: GeometryIRV1, project: ProjectConfigV1, sequence: number): Promise<Layout> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const runner = await (this.#runner ??= this.loadRunner());
      if (sequence !== this.#sequence) throw new DOMException("Layout changed", "AbortError");
      const job = runner.prepareNestJob(geometry, project);
      if (!job.ok) return { layoutNote: "Automatic layout unavailable. Using original panels; check the work area and piece sizes." };
      this.#client ??= new runner.NestClient();
      // Stop at the best complete layout if the optimizer runs past its budget.
      timer = setTimeout(() => { if (sequence === this.#sequence) this.#client?.stop(); }, this.timeoutMs);
      const sheetPlan = await this.#client.run(job.parts, job.settings, { budgetMs: 5000 });
      if (sequence !== this.#sequence) throw new DOMException("Layout changed", "AbortError");
      const { sheetWidthMm: width, sheetHeightMm: height } = sheetPlan.settings;
      return { sheetPlan, layoutNote: `Automatic layout · ${sheetPlan.sheets.length} ${sheetPlan.sheets.length === 1 ? "sheet" : "sheets"} · ${width} × ${height} mm` };
    } catch (error) {
      if (sequence !== this.#sequence) throw new DOMException("Layout changed", "AbortError");
      const reason = error instanceof Error && "code" in error && error.code === "oversize"
        ? "Pieces exceed the usable sheet size. Using original panels; check the work area or reduce the cut size."
        : "Automatic layout unavailable. Using original panels.";
      return { layoutNote: reason };
    } finally { if (timer !== undefined) clearTimeout(timer); }
  }
}
