import type { LineStyleV1, OperationPath } from "@topostack/core";

/** The visual class a marking is drawn with, shared by the 2D, engraving, and 3D previews. */
export type MarkingStyleKey = "score" | "major-road" | "local-road" | "trail" | "boundary" | "grid" | "engrave";

export function markingStyleKey(marking: Pick<OperationPath, "operation" | "kind" | "transportationClass">): MarkingStyleKey {
  if (marking.operation === "score") return "score";
  if (marking.transportationClass === "major-road") return "major-road";
  if (marking.transportationClass === "local-road") return "local-road";
  if (marking.transportationClass === "trail") return "trail";
  if (marking.kind === "boundary") return "boundary";
  if (marking.kind === "grid") return "grid";
  return "engrave";
}

export const MARKING_COLORS: Record<MarkingStyleKey, string> = {
  score: "#365c79",
  "major-road": "#24180f",
  "local-road": "#62442f",
  trail: "#8a5e35",
  boundary: "#6f4057",
  grid: "#59636e",
  engrave: "#2b2119",
};

export function markingColor(marking: Pick<OperationPath, "operation" | "kind" | "transportationClass">): string {
  return MARKING_COLORS[markingStyleKey(marking)];
}

/** Stroke width in millimetres. Road classes take precedence over the feature kind. */
export function markingWidth(marking: Pick<OperationPath, "kind" | "transportationClass">, style: LineStyleV1): number {
  if (marking.transportationClass === "major-road") return style.majorRoadMm;
  if (marking.transportationClass === "local-road") return style.localRoadMm;
  if (marking.transportationClass === "trail") return style.trailMm;
  if (marking.kind === "water") return style.waterMm;
  if (marking.kind === "boundary") return style.boundaryMm;
  if (marking.kind === "grid") return style.coordinateGridMm;
  return style.annotationMm;
}

function trailDash(style: LineStyleV1): string | undefined {
  const { trailMm, trailPattern } = style;
  if (trailPattern === "solid") return undefined;
  return trailPattern === "dotted" ? `0.01 ${Math.max(trailMm * 4, 0.7)}` : `${Math.max(trailMm * 6, 1.2)} ${Math.max(trailMm * 4, 0.8)}`;
}

/** SVG `stroke-dasharray` in millimetres, or undefined for a solid line. */
export function markingDash(marking: Pick<OperationPath, "kind" | "transportationClass">, style: LineStyleV1): string | undefined {
  if (marking.kind === "boundary") return `${Math.max(style.boundaryMm * 8, 1.6)} ${Math.max(style.boundaryMm * 5, 1)}`;
  if (marking.kind === "grid") return `0.01 ${Math.max(style.coordinateGridMm * 5, 0.9)}`;
  return marking.transportationClass === "trail" ? trailDash(style) : undefined;
}
