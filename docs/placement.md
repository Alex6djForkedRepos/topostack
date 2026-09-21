# Placement mode

Placement mode is how the studio lets a maker position, and where it makes
sense resize, something on the piece by hand. It serves the north arrow, the
title and the scale bar; markers, the preferred elevation-label position and
custom-line points are meant to join it. The code lives in `apps/generator/src/lib/studio/placement/`.

## The flow

1. A sidebar control calls `startPlacement(id)`. The studio opens a
   `PlacementSession`: the selected placeable and an empty `draft`.
2. The preview becomes a top-down view of the finished piece:
   - Layered projects keep the 3D preview mounted. Its `placement` prop collapses
     the exploded stack, eases the orbit camera overhead, then renders with an
     orthographic camera. Orbiting is off.
   - Flat engravings, and layered projects without WebGL, draw
     `StackTopView`: every sheet painted bottom to top with its markings.

   Either way, the generated markings of the placeables are hidden, so the old
   position is not shown twice.
3. `PlacementLayer` draws every available placeable above everything, from the
   draft. A placeable cannot disappear under a sheet, because it is not on one yet.
   Dragging, arrow-key nudges, the resize grip, + and −, and Tab only change
   the draft. Nothing saves or
   regenerates while the session is open, and undo/redo are paused.
4. **Done** hands the draft to `updateFabrication` as one edit. The normal
   pipeline regenerates, and generation decides which sheets the item lands on,
   exactly as for any other setting. This gives one regeneration and one undo step.
   **Cancel** or Esc drops the draft.

## One shared camera

The layer is an SVG whose viewBox is the artwork plus a margin
(`placementViewBox`), fitted with the default `xMidYMid meet`. Each backdrop
draws with that same fit: `StackTopView` uses the same viewBox, and the
orthographic camera's frustum comes from `placementFrustum`. So millimeters
line up without passing a camera object between components.

The pointer math is one number, millimeters per pixel from the SVG's
bounding box.

Interaction lives in SVG rather than WebGL picking for four reasons:
- focus, keyboard and screen-reader behavior come from the DOM
- text stays crisp
- the same layer works over both backdrops
- jsdom client tests exercise it without a GPU

## Adding a placeable

Add an entry to `PLACEABLES` in `placeables.ts` and to `PLACEABLE_ORDER`.
Every function receives the project and a `PlacementContext`, which holds facts
from the generated preview, such as the ground width that sets the scale bar's
length:

- `available(project)`: whether it is switched on.
- `center(project)` / `moveTo(project, center)`: read and write its position
  through ordinary project fields. Positions must stay valid under
  `validateProject`. Clamp inside the material, as the core `placementAt`
  helpers do for anchored annotations.
- `outline(project)`: the closed ring used as the hit and focus target.
- `markings(project)`: the real output from the core function generation
  uses, so the draft looks exactly like the result.
- `resize` (optional): which size it has, its range, a keyboard step and the
  patch that sets it. `resizePlaceable` clamps to the range and keeps the
  center where it is, recomputing the placement for the new size, because
  anchored travel depends on size. Leave it out when the size is not the
  maker's to choose, as with the scale bar, whose length follows the map scale.
- `bakedMarkingPrefixes`: id prefixes of what generation emits for it. These
  are hidden in the backdrop while a draft is shown. `placeables.test.ts`
  checks them against real generated geometry.

Then add a sidebar control that calls `startPlacement(id)`. The draft is a
project patch, so no new state, persistence or migration is needed unless the
placeable needs a new project field. Versioned fields still follow the
migration rule in the architecture doc.

An annotation should be generated onto the exposed surface (`followSurface`
in `placeAnnotations`), so wherever it is placed, no upper sheet hides it.
