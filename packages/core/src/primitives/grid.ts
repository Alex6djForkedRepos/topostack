/**
 * The one mapping between elevation-grid samples and model millimeters, plus
 * the grid-edge test every lake needs.
 */

/**
 * Offset of sample `index` of `count` across a `span` centered on zero, in
 * whatever unit the span is given in - model millimeters for geometry, ground
 * meters where shore distances are measured.
 *
 * Every reader of the elevation grid has to agree on this to the ulp:
 * `contourToMm` maps d3-contour rings forward with it, `sampleElevation` reads
 * the same rings' elevations back with `sampleIndexAt`, and the water carve
 * rasterizes outlines against it. A second copy of the arithmetic drifting is a
 * correctness bug, not a duplication, so there is exactly one.
 *
 * Fractional indexes are deliberate: d3-contour's cell space puts sample (i, j)
 * at (i + 0.5, j + 0.5), and border cells are nudged inward by a fraction of a
 * cell so ray casting can decide them.
 */
export function sampleOffset(index: number, count: number, span: number): number {
  return (index / (count - 1) - 0.5) * span;
}

/** Exact inverse of `sampleOffset`: the fractional sample index at `offset`. */
export function sampleIndexAt(offset: number, count: number, span: number): number {
  return (offset / span + 0.5) * (count - 1);
}

/**
 * Whether any of these cells sits in the grid's outermost row or column.
 *
 * A water body that reaches the border has no complete shoreline in view, so
 * distances measured from it would run to a crop edge as if it were a bank.
 * Both the vector-shore choice and the terrain basin prior turn on this answer,
 * and each used to scan the lake's cells for it separately.
 */
export function cellsTouchGridEdge(cells: readonly number[], width: number, height: number): boolean {
  return cells.some((cell) => cell < width || cell >= width * (height - 1) || cell % width === 0 || cell % width === width - 1);
}
