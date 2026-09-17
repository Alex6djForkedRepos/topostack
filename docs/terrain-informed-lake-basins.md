# Terrain-informed lake basins

When a lake has no surveyed floor, TopoStack uses the dry terrain around its
shoreline to vary the modeled basin shape. Steep banks deepen faster than gentle
banks, so the deepest point can move away from the geometric center. This is a
shape estimate, not measured bathymetry. Published survey samples and DEMs that
already contain underwater relief keep their existing precedence.

## Method

1. Rasterize lake outlines and islands at the terrain sample locations. Distances
   and slopes use ground meters on each axis, independent of output stretching.
   With smoothing enabled, complete lakes measure exact distance to the vector
   shoreline (including islands), indexed by a segment bounding-volume tree.
   This avoids terraces caused by measuring to the nearest dry grid-cell center.
   Clipped/edge-touching lakes and smoothing-disabled output retain the raster
   distance transform.
2. At shoreline cells, estimate the outward direction and sample three rays
   through the original dry DEM. Each ray needs at least three distinct valid
   samples. Median rise/run estimates reduce sensitivity to isolated elevation
   spikes. Other water bodies are excluded before any lake is carved.
3. Use a terrain neighborhood of 250 m where resolution permits, bounded to
   4–12 cells on the coarser axis. Regularize slope against `Dmax / L` (with a
   0.01 floor), using `sqrt((slope + baseline) / (2 * baseline))`, clamped to
   0.5–2. These are conservative heuristic settings, not calibrated coefficients.
4. Average bank influence inward along the shoreline-distance gradient, then
   solve `|gradient(depth)| = slopeFactor` with an anisotropic fast-sweeping
   method. With vector shore distances, boundary water samples are seeded at
   their actual distance times the bank factor, with dry samples excluded from
   the solve. This lets opposing slopes meet continuously without multiplying a
   hard nearest-shore assignment into the floor. The solve is bounded to eight
   cycles; a nonconverged solve uses the original distance field.
5. Normalize the shape to the existing maximum-depth/radius constraint, then fit
   the profile exponent to HydroLAKES mean depth where available. The per-lake
   maximum override still applies, and depth exaggeration scales the final bed
   uniformly. Stack allocation reserves the required water sheets (up to the
   existing depth cap) within the 24-sheet total, reducing and refitting land
   sheets if needed. Existing fabrication depth fitting happens afterward.

The same profile fills survey gaps only where the DEM does not already contain
underwater relief. Measured samples are unchanged; coverage remains `mixed`. For smoothed, complete
lakes with no modeled maximum and no underwater DEM relief, a narrow uncovered
survey rim instead uses nearby survey depths tapered to the vector shore; remote
and interior gaps remain at the waterline. See [shoreline smoothing](lake-shoreline-smoothing.md).
The preview displays one estimated-depth warning when any included lake is
modeled, uses a user maximum-depth override, or has mixed survey coverage. The
notice is prioritized alongside the depth-fitting action and also travels with
exported warning metadata. Fully surveyed lakes, disabled water depth, and flat
engraving do not receive this notice.

No new downloads, model weights, or external service are needed.

## Fallbacks and limits

- A modeled depth smaller than the sheet elevation interval may produce no
  underwater contour in the fabricated stack. On a wide mountain view, raise
  water depth exaggeration to inspect the basin. In the live Jenny Lake test
  centered at 43.76, -110.73 at zoom 12, 1× produced no underwater contour while
  4× produced two. Keep the whole shoreline and surrounding land in the crop.

- A clipped lake, or any lake touching the terrain-grid edge, retains the original
  distance profile and whole-lake radius. Its visible terrain cannot constrain
  the entire basin. A crop with no visible shore still cannot be modeled.
- Fewer than four usable shoreline slope estimates, or a factor range below
  0.05, retains the exact Euclidean distance fallback. Uniformly flat terrain
  adds no directional information.
- A maximum depth is still required to carve a fully modeled lake. Terrain alone
  does not establish an absolute depth. Mean-depth fitting keeps its existing
  bounded exponent and is skipped for lakes explicitly marked clipped.
- Sampling depends on DEM resolution and the land visible in the current crop.
  It does not recover submerged channels, sediment thickness, dams, glacial
  overdeepening, or caldera features absent from the surrounding terrain.
- `modeled`, `user`, and `mixed` provenance labels retain their meaning. No
  accuracy claim is implied by a more varied floor. Calibration against held-out
  surveyed lakes is needed before claiming an improvement in real-world accuracy.

The physical premise has precedent in [Hollister et al. (2011)](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0025764)
and [Messager et al. (2016)](https://www.nature.com/articles/ncomms13603), which use
surrounding topography as a predictor of lake depth. TopoStack's bounded shape
prior is its own heuristic implementation, not a reproduction of their models.

Regression tests cover asymmetric slopes, maximum and mean depth, exaggeration,
physical grid spacing, resolution changes, flat/missing terrain, crop fallbacks,
survey gaps, islands, elevated banks, DEM spikes, and neighboring lakes.
