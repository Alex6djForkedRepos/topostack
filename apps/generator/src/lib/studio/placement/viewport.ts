/**
 * The one camera every placement surface shares: the artwork centered, with a
 * margin, fitted into the stage like an SVG viewBox with xMidYMid meet. The
 * interaction layer is that SVG; each backdrop only has to draw with the same
 * fit, so millimeters line up without passing a camera between components.
 */
export interface PlacementViewBox { x: number; y: number; width: number; height: number }

/** Margin around the artwork, so edge placements and the toolbar keep clear of the stage border. */
export function placementMarginMm(widthMm: number, heightMm: number): number {
  return Math.max(widthMm, heightMm) * 0.08 + 5;
}

export function placementViewBox(widthMm: number, heightMm: number, marginMm: number): PlacementViewBox {
  return { x: -widthMm / 2 - marginMm, y: -heightMm / 2 - marginMm, width: widthMm + marginMm * 2, height: heightMm + marginMm * 2 };
}

/**
 * Half extents, in millimeters, of what a stage `stageWidth` × `stageHeight`
 * pixels shows at the meet fit: the frustum of a top-down orthographic camera.
 */
export function placementFrustum(box: PlacementViewBox, stageWidth: number, stageHeight: number): { halfWidth: number; halfHeight: number } {
  const unitsPerPixel = Math.max(box.width / Math.max(stageWidth, 1), box.height / Math.max(stageHeight, 1));
  return { halfWidth: stageWidth * unitsPerPixel / 2, halfHeight: stageHeight * unitsPerPixel / 2 };
}
