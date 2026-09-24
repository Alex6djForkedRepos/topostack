import { alignmentGuideMarkings } from "./alignment.js";
import { elevationLabelOptions, type ElevationLabelOption } from "../annotate/label-placement.js";
import type { LayerIR, OperationPath, Polygon2D, ProjectConfigV1 } from "../types.js";

export type GeometryTask =
  | { kind: "alignment"; layer: LayerIR; nextLayer: Pick<LayerIR, "index" | "polygons" | "pieces">; outlines: Polygon2D[] }
  | { kind: "elevation-labels"; layer: LayerIR; covering?: Pick<LayerIR, "polygons">; labels: string[] };
export interface GeometryBatch { config: ProjectConfigV1; tasks: GeometryTask[] }
export type GeometryTaskResult =
  | { kind: "alignment"; markings: OperationPath[] }
  | { kind: "elevation-labels"; options: ElevationLabelOption[] };

/** Pure task kernel used by worker, fallback, and deterministic parity tests. */
export function executeGeometryTask(config: ProjectConfigV1, task: GeometryTask): GeometryTaskResult {
  switch (task.kind) {
    case "alignment": return { kind: task.kind, markings: alignmentGuideMarkings(config, task.layer, task.nextLayer, task.outlines) };
    case "elevation-labels": return { kind: task.kind, options: elevationLabelOptions(task.labels, config, task.layer, task.covering) };
  }
}
