# Placement mode

Placement mode is how the studio lets a maker position, and where it makes
sense resize or turn, something on the piece by hand. It serves the north
arrow, the title, the scale bar and every placed custom graphic; markers, the
preferred elevation-label position and custom-line points are meant to join it. The code lives in `apps/generator/src/lib/studio/placement/`.

## The flow

1. A sidebar control calls `startPlacement(id)`. The studio opens a
   `PlacementSession`: the selected placeable and an empty `draft`.
2. The preview becomes a top-down view of the finished piece:
   - Layered projects keep the 3D preview mounted. Its `placement` prop collapses
     the exploded stack, eases the orbit camera overhead, then renders with an
     orthographic camera. Orbiting is off.
   - Flat engravings, and layered projects without WebGL, draw
     `StackTopView`: the material sheets painted bottom to top.

   Either way, generated markings are hidden in the material backdrop.
   `PlacementArtwork` composes the saved markings and draft annotations in SVG.
   Title and marker knockouts mask earlier artwork, preserving the material
   texture beneath them; markers remain above the title. Static marking
   components retain their path data while a draft moves.
3. `PlacementLayer` draws every available placeable above everything, from the
   draft. A placeable cannot disappear under a sheet, because it is not on one yet.
   Dragging, arrow-key nudges, the resize and rotation grips, + and −, [ and ],
   adding or deleting a graphic, and Tab only change the draft. Placement gestures do not save or regenerate; sidebar edits
   still use the normal update flow. Undo/redo are paused.
4. **Done** merges the placement-owned fields into the current project and hands
   that patch to `updateFabrication` as one edit. The normal
   pipeline regenerates, and generation decides which sheets the item lands on,
   exactly as for any other setting. This gives one regeneration and one undo step.
   **Cancel** or Esc drops the draft.

## One shared camera

The layer is an SVG whose viewBox is the artwork plus a margin
(`placementViewBox`), fitted with the default `xMidYMid meet`. Each backdrop
draws with that same fit: `StackTopView` uses the same viewBox, and the
orthographic camera's frustum comes from `placementFrustum`. So millimeters
line up without passing a camera object between components. The SVG, flat
backdrop, and 3D container share the drawing area below the placement toolbar;
the controls reserve screen space so default edge annotations remain reachable.

The pointer math is one number, millimeters per pixel from the SVG's
bounding box.

Interaction lives in SVG rather than WebGL picking for four reasons:
- focus, keyboard and screen-reader behavior come from the DOM
- text stays crisp
- the same layer works over both backdrops
- jsdom client tests exercise it without a GPU

## Graphics: placeables by instance

The fixed annotations are one entry each in `PLACEABLES`. Placed graphics are
many, so `placeableFor(id)` builds one per `graphic:<placed id>` on demand, and
`availablePlaceables` lists them after the fixed items in project order. A
graphic's position, size, angle and laser operation all live on its entry in
`placedGraphics`, so its draft is that whole list: adding, removing, turning or
switching a graphic to Cut are ordinary draft edits, and Done is still one
edit and one undo step. `placementPatch` drops drafts whose artwork was removed
from the library meanwhile. A session stays open with nothing selected while
the library still has a graphic to add.

While placing, every generated `graphic-` marking is hidden and the drafts are
drawn instead, layered as generation layers them: after the title, before
markers, each masked by later halos. A **cut** graphic changes sheet outlines,
not markings, and those regenerate only on Done; until then the backdrop keeps
the old opening and the draft shows the new one as a dashed cut-colored
outline.

## Adding a placeable

Add an entry to `PLACEABLES` in `placeables.ts` and to `PLACEABLE_ORDER`
(or, for items the maker creates many of, build them in `placeableFor` as
graphics are).
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
- `name` (optional): the maker's own name for it, when it has one.
- `rotate`, `operation`, `remove` (optional): turning, the laser operation and
  deletion in place, as graphics offer.
- `resize` (optional): which size it has, its range, a keyboard step and the
  patch that sets it. `resizePlaceable` clamps to the range and keeps the
  center where it is, recomputing the placement for the new size, because
  anchored travel depends on size. Leave it out when the size is not the
  maker's to choose, as with the scale bar, whose length follows the map scale.
- `bakedMarkingPrefixes`: id prefixes of what generation emits for it. These
  are hidden in the backdrop while a draft is shown. `placeables.test.ts`
  checks them against real generated geometry.

Then add a sidebar control that calls `startPlacement(id)`. The draft uses `PlacementPatch`, which contains only position and size fields.
Nested fields are merged at preview and commit time so live title text, font,
and enabled-state edits survive. Extend that type when adding a placeable;
no new persistence or migration is needed unless the
placeable needs a new project field. Versioned fields still follow the
migration rule in the architecture doc.

An annotation should be generated onto the exposed surface (`followSurface`
in `placeAnnotations`), so wherever it is placed, no upper sheet hides it.

## Loading and interaction

`PlacementStage` waits for the selected project's glyphs before mounting any
font-dependent draft geometry. A failed load offers Retry and Cancel; obsolete
loads cannot update a newer selection or an unmounted stage. History actions
and their toolbar controls are disabled for the entire placement session.

The terrain backdrop changes only when generated geometry or placement mode
changes. Pointer and keyboard edits update SVG artwork and masks; they do not
regenerate terrain or rebuild the 3D scene. The browser placement test attaches
frame timings for tracking interaction performance without imposing
hardware-dependent timing thresholds on CI.
