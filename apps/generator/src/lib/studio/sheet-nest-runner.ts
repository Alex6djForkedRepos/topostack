import { nestableParts, resolveSheetNestSettings, sheetNestJobKey, type GeometryIRV1, type NestPartV1, type ProjectConfigV1, type ResolvedSheetNestSettings, type SheetNestPlanV1 } from "@topostack/core";

/**
 * The studio's sheet-nesting code, loaded only when the maker opens the
 * sheet layout: core's planner and part extraction live in the export chunk
 * and must not ride along with the studio's first paint.
 */
export { NestClient, NestJobError } from "$lib/workers/nest-client";

export type NestJob = { ok: true; parts: NestPartV1[]; settings: ResolvedSheetNestSettings } | { ok: false; error: string };

export function prepareNestJob(geometry: GeometryIRV1, project: ProjectConfigV1): NestJob {
  const resolved = resolveSheetNestSettings(project);
  if (!resolved.ok) return resolved;
  const parts = nestableParts(geometry);
  if (!parts.length) return { ok: false, error: "Generate the terrain before nesting its parts." };
  return { ok: true, parts, settings: resolved.settings };
}

export interface SheetPreview {
  widthMm: number;
  heightMm: number;
  provisional: boolean;
  usedWidthMm: number;
  parts: Array<{ label: string; path: string }>;
}

/** Each sheet's placed part outlines as SVG path data, for the dialog's thumbnails. */
export function sheetPreviews(plan: SheetNestPlanV1, parts: NestPartV1[]): SheetPreview[] {
  const byId = new Map(parts.map((part) => [part.id, part]));
  const round = (value: number) => Math.round(value * 10) / 10;
  return plan.sheets.map((sheet) => ({
    widthMm: plan.settings.sheetWidthMm,
    heightMm: plan.settings.sheetHeightMm,
    provisional: Boolean(sheet.provisional),
    usedWidthMm: sheet.usedWidthMm,
    parts: sheet.placements.flatMap((placement) => {
      const part = byId.get(placement.partId);
      if (!part) return [];
      const radians = (placement.rotationDeg * Math.PI) / 180;
      const [cos, sin] = [Math.cos(radians), Math.sin(radians)];
      // Thumbnails are a few hundred pixels wide; about 120 vertices per outline is plenty.
      const step = Math.max(1, Math.floor(part.outline.length / 120));
      const points = part.outline.filter((_, index) => index % step === 0).map(({ x, y }) => `${round(cos * x - sin * y + placement.xMm)} ${round(sin * x + cos * y + placement.yMm)}`);
      return [{ label: part.label, path: `M${points.join("L")}Z` }];
    }),
  }));
}

/** The key a plan for this job is saved under. */
export function jobKeyOf(job: Extract<NestJob, { ok: true }>): string {
  return sheetNestJobKey(job.parts, job.settings);
}

/** Whether a plan still fits this geometry and these sheet settings. */
export function planIsCurrent(plan: SheetNestPlanV1, geometry: GeometryIRV1, project: ProjectConfigV1): boolean {
  const job = prepareNestJob(geometry, project);
  return job.ok && sheetNestJobKey(job.parts, job.settings) === plan.jobKey;
}
