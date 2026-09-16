import { sourceRequirements, type Point2D, type ProjectConfigV1, type SourceBundleV1 } from "@topostack/core";
import { applySurveyProvenance } from "../bathymetry";
import { loadLakeAreas, loadSurveyedLakeDepths, loadVectorMarkings } from "../data-provider";
import { changedProjectKeys, projectPatch } from "./project-diff";
import { resolveLakeOutlines } from "../lake-outlines";
import { assembleWater } from "../water-assembly";

export function resizeSource(source: SourceBundleV1, from: ProjectConfigV1, to: ProjectConfigV1): SourceBundleV1 {
  if (from.widthMm === to.widthMm && from.heightMm === to.heightMm) return source;
  const scaleX = to.widthMm / from.widthMm;
  const scaleY = to.heightMm / from.heightMm;
  const scalePoints = (points: Point2D[]) => points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY }));
  return {
    ...source,
    markings: source.markings.map((marking) => ({ ...marking, points: scalePoints(marking.points) })),
    ...(source.waterAreas ? { waterAreas: source.waterAreas.map((area) => ({ ...area, polygon: { outer: scalePoints(area.polygon.outer), holes: area.polygon.holes.map(scalePoints) } })) } : {}),
    ...(source.inlandWaterAreas ? { inlandWaterAreas: source.inlandWaterAreas.map((polygon) => ({ outer: scalePoints(polygon.outer), holes: polygon.holes.map(scalePoints) })) } : {}),
    ...(source.waterPatternAreas ? { waterPatternAreas: source.waterPatternAreas.map((polygon) => ({ outer: scalePoints(polygon.outer), holes: polygon.holes.map(scalePoints) })) } : {}),
  };
}

/**
 * Mark source layers stale when an edit enables data the source was not
 * loaded with. `patch` is the difference from the source's own project.
 */
export function markStaleSourceData(source: SourceBundleV1, patch: Partial<ProjectConfigV1>, sourceProject: ProjectConfigV1, nextProject: ProjectConfigV1): SourceBundleV1 {
  if (source.sourceKind !== "real") return source;
  let next = source;
  const changesVectorDetails = ["showRoads", "showTrails", "showWater", "showBoundaries"].some((key) => key in patch) || (patch.showWaterDepth === true && !sourceProject.showWater);
  if (changesVectorDetails) next = { ...next, vectorStatus: "not-requested" };
  if (patch.showWaterDepth === true) next = { ...next, lakeDataStatus: "not-requested" };
  const enablesDepthByMode = nextProject.outputMode === "stack" && nextProject.showWaterDepth && sourceProject.outputMode !== "stack";
  if (enablesDepthByMode) next = { ...next, ...(!sourceProject.showWater ? { vectorStatus: "not-requested" as const } : {}), lakeDataStatus: "not-requested" };
  return next;
}

export async function refreshRequiredMapData(source: SourceBundleV1, config: ProjectConfigV1, signal: AbortSignal): Promise<SourceBundleV1> {
  if (source.sourceKind !== "real") return source;
  const { lakes: usesWaterDepth, vectors: needsVectors } = sourceRequirements(config);
  let next = source;
  let inland = source.inlandWaterAreas ?? [];
  let ocean = (source.waterAreas ?? []).filter((area) => area.kind === "ocean").map((area) => area.polygon);
  let lakes = (source.waterAreas ?? []).filter((area) => area.kind === "lake");

  if (needsVectors && source.vectorStatus !== "available") {
    try {
      const vector = await loadVectorMarkings(source.bounds, config.location.zoom, config, signal);
      ocean = vector.ocean;
      inland = vector.inland;
      next = {
        ...next,
        markings: vector.markings,
        waterPatternAreas: [...vector.ocean, ...vector.inland],
        inlandWaterAreas: vector.inland,
        vectorStatus: vector.truncated ? "partial" : "available",
      };
    } catch (error) {
      if (signal.aborted) throw error;
      ocean = [];
      inland = [];
      next = {
        ...next,
        markings: next.markings.filter((marking) => marking.kind !== "road" && marking.kind !== "trail" && marking.kind !== "water" && marking.kind !== "boundary"),
        waterPatternAreas: [],
        inlandWaterAreas: [],
        vectorStatus: "unavailable",
      };
    }
  }

  if ((usesWaterDepth || config.showWater) && source.lakeDataStatus !== "available") {
    try {
      lakes = await loadLakeAreas(source.bounds, config.location.zoom, config, signal);
      next = { ...next, lakeDataStatus: "available", bathymetryStatus: undefined };
    } catch (error) {
      if (signal.aborted) throw error;
      lakes = [];
      next = { ...next, lakeDataStatus: "unavailable" };
    }
  }

  if (usesWaterDepth || config.showWater) {
    const resolved = resolveLakeOutlines([], lakes.filter((lake) => lake.outlineSource !== "osm"), inland);
    if (resolved.length !== lakes.length || resolved.some((area) => !lakes.some((lake) => lake.id === area.id))) next = { ...next, bathymetryStatus: undefined };
    if (resolved.length && next.lakeDataStatus !== "available") next = { ...next, lakeDataStatus: "available" };
    lakes = resolved.map((area) => ({ ...area, bathymetry: lakes.find((lake) => lake.id === area.id)?.bathymetry }));
  }

  if (usesWaterDepth && (next.bathymetryStatus === undefined || next.bathymetryStatus === "unavailable" || next.bathymetryStatus === "partial")) {
    const bathymetry = await loadSurveyedLakeDepths(source.bounds, source.elevation, config.location.zoom, lakes, signal, config);
    lakes = bathymetry.areas;
    next = applySurveyProvenance(next, bathymetry);
  } else if (!usesWaterDepth) {
    next = applySurveyProvenance(next, { areas: lakes, status: "not-covered", datasetVersions: [], attribution: [] });
  }
  return assembleWater(next, lakes, ocean, config);
}

/** Only the settings that change what `refreshRequiredMapData` loads or assembles. */
function preparationKey(config: ProjectConfigV1): string {
  return JSON.stringify([sourceRequirements(config), config.showWater, config.showRoads, config.showTrails, config.showBoundaries, config.minimumFeatureMm, config.widthMm, config.heightMm, config.location.zoom]);
}

/**
 * Remembers the last prepared source. Text size, thickness, and similar edits
 * reuse it instead of re-running lake resolution and polygon clipping, and the
 * stable object identity lets the geometry worker skip re-cloning the source.
 */
export class SourcePreparationCache {
  private entry: { input: SourceBundleV1; inputSignature: string; output: SourceBundleV1; key: string } | undefined;

  async prepare(active: SourceBundleV1, sourceProject: ProjectConfigV1, previewProject: ProjectConfigV1, nextProject: ProjectConfigV1, signal: AbortSignal): Promise<SourceBundleV1> {
    const patch = projectPatch(sourceProject, previewProject);
    const key = preparationKey(nextProject);
    // Everything besides `key` that shapes the output for a given input object.
    const inputSignature = JSON.stringify([sourceProject.widthMm, sourceProject.heightMm, sourceProject.showWater, sourceProject.outputMode, ...changedProjectKeys(sourceProject, previewProject).filter((name) => name.startsWith("show")).sort(), patch.showWaterDepth ?? null]);
    const entry = this.entry;
    if (entry && entry.key === key) {
      if (entry.input === active && entry.inputSignature === inputSignature) return entry.output;
      // A committed prepared source is its own fixed point unless the edit asks for data it lacks.
      if (entry.output === active && markStaleSourceData(active, patch, sourceProject, nextProject) === active) return entry.output;
    }
    const resized = resizeSource(active, sourceProject, previewProject);
    const output = await refreshRequiredMapData(markStaleSourceData(resized, patch, sourceProject, nextProject), nextProject, signal);
    if (!signal.aborted) this.entry = { input: active, inputSignature, output, key };
    return output;
  }

  clear(): void { this.entry = undefined; }
}
