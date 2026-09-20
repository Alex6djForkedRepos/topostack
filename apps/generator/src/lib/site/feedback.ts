import type { ProjectConfigV1, SourceBundleV1, GeometryIRV1 } from '@topostack/core';

export const ISSUE_TRACKER = 'https://github.com/Echo-Foxtrot-Works/topostack/issues';
export const FEEDBACK_TYPES = {
  bug: { label: 'Something is broken', prefix: 'Bug', hint: 'What happened, what did you expect, and how can we reproduce it?' },
  feature: { label: 'Feature request', prefix: 'Feature', hint: 'What would you like to do, and how would it help your workflow?' },
  terrain: { label: 'Terrain data quality', prefix: 'Terrain data', hint: 'Where is the terrain coarse, missing, or inaccurate? Include a better elevation source if you know one.' },
  lake: { label: 'Lake data quality', prefix: 'Lake data', hint: 'Which lake has coarse, missing, or inaccurate outlines or depths? Include a survey or source link if you know one.' },
} as const;
export type FeedbackType = keyof typeof FEEDBACK_TYPES;
export type FeedbackContext = Record<string, unknown>;

/** Explicit allowlist: never include project names, custom geometry, URL queries, or raw grids. */
export function studioFeedbackContext(project: ProjectConfigV1, source: SourceBundleV1, geometry: GeometryIRV1, stale: boolean): FeedbackContext {
  return {
    selectedLocation: { lat: project.location.lat, lon: project.location.lon, zoom: project.location.zoom, bounds: project.location.bounds },
    preview: { sourceKind: source.sourceKind, bounds: source.bounds, selectionChanged: stale, datasetVersion: source.datasetVersion, resolutionM: source.resolutionM },
    settings: { outputMode: project.outputMode, widthMm: project.widthMm, heightMm: project.heightMm, materialThicknessMm: project.materialThicknessMm, verticalExaggeration: project.verticalExaggeration, showWaterDepth: project.showWaterDepth, waterDepthExaggeration: project.waterDepthExaggeration, fitLakeDepth: project.fitLakeDepth },
    terrain: source.terrainSelection,
    dataStatus: { vectors: source.vectorStatus, lakes: source.lakeDataStatus, bathymetry: source.bathymetryStatus },
    lakes: source.waterAreas?.slice(0, 12).map((lake) => ({ id: lake.id, name: lake.name, hylakId: lake.hylakId, surveyId: lake.surveyId, outlineSource: lake.outlineSource, depthSource: lake.depthSource, sampleSpacingM: lake.bathymetry?.sampleSpacingM })),
    lakeCount: source.waterAreas?.length ?? 0,
    warningCodes: [...new Set(geometry.warnings.map((warning) => warning.code))],
  };
}

export function feedbackReport(type: FeedbackType, details: string, context?: FeedbackContext): string {
  return `## ${FEEDBACK_TYPES[type].prefix}\n\n${details.trim()}${context ? `\n\n## Diagnostic context (shared by reporter)\n\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\`` : ''}\n\n---\nCreated with TopoStack feedback. Screenshots or project settings can be attached on GitHub after checking for private information.`;
}

export function feedbackLink(type: FeedbackType, summary: string, body: string): { url: string; needsPaste: boolean } {
  const url = new URL(`${ISSUE_TRACKER}/new`);
  url.searchParams.set('title', `[${FEEDBACK_TYPES[type].prefix}] ${summary.trim()}`);
  url.searchParams.set('body', body);
  // Keep oversized/unicode reports intact via copy/paste instead of truncating them or sending an unusable URL.
  const needsPaste = url.href.length > 7000;
  if (needsPaste) url.searchParams.delete('body');
  return { url: url.href, needsPaste };
}
