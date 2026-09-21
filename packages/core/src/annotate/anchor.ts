import { cropRadiusMm } from "../primitives/crop.js";
import { clamp } from "../primitives/geometry2d.js";
import type { NorthArrowAnchor, NorthArrowPlacementV1, Point2D, ProjectConfigV1 } from "../types.js";

/** Clearance between an anchored annotation and the crop edge. */
export const ANNOTATION_CLEARANCE_MM = 3;

export const ANCHOR_VECTORS: Record<NorthArrowAnchor, Point2D> = {
  "top-left": { x: -1, y: -1 }, top: { x: 0, y: -1 }, "top-right": { x: 1, y: -1 },
  left: { x: -1, y: 0 }, center: { x: 0, y: 0 }, right: { x: 1, y: 0 },
  "bottom-left": { x: -1, y: 1 }, bottom: { x: 0, y: 1 }, "bottom-right": { x: 1, y: 1 },
};

/**
 * Center, relative to the artwork center, of an annotation anchored inside the
 * crop. A rectangle keeps `halfWidth`/`halfHeight` plus the clearance inside
 * each edge; a circle keeps `radialHalfExtent` inside the radius.
 */
export function anchoredCenter(
  config: Pick<ProjectConfigV1, "widthMm" | "heightMm" | "cropShape">,
  placement: NorthArrowPlacementV1,
  halfWidth: number,
  halfHeight: number,
  radialHalfExtent = Math.max(halfWidth, halfHeight),
): Point2D {
  const vector = ANCHOR_VECTORS[placement.anchor];
  const offset = placement.offset;
  if (config.cropShape === "rectangle") {
    const availableX = Math.max(0, config.widthMm / 2 - halfWidth - ANNOTATION_CLEARANCE_MM);
    const availableY = Math.max(0, config.heightMm / 2 - halfHeight - ANNOTATION_CLEARANCE_MM);
    return {
      x: clamp((vector.x + offset.x) * availableX, -availableX, availableX),
      y: clamp((vector.y + offset.y) * availableY, -availableY, availableY),
    };
  }
  const availableRadius = Math.max(0, cropRadiusMm(config) - radialHalfExtent - ANNOTATION_CLEARANCE_MM);
  const anchorLength = Math.hypot(vector.x, vector.y);
  const anchor = anchorLength > 1 ? { x: vector.x / anchorLength, y: vector.y / anchorLength } : vector;
  const desired = { x: (anchor.x + offset.x) * availableRadius, y: (anchor.y + offset.y) * availableRadius };
  const length = Math.hypot(desired.x, desired.y);
  if (length <= availableRadius || length === 0) return desired;
  return { x: desired.x * availableRadius / length, y: desired.y * availableRadius / length };
}
