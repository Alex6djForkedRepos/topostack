# Sheet nesting

Sheet nesting arranges a project's cut parts on as few stock sheets as possible. Parts are moved and, if the settings allow it, rotated. This differs from the *material nests* that generation already plans (see [architecture.md](architecture.md)). A material nest cuts a smaller layer from the waste of a lower layer at the same position, and nothing moves. Sheet nesting runs after that step and treats each nest family as a single rigid part.

Status: the packing engine (`packages/nest-wasm`) and the multi-sheet planner (`packages/core/src/export/sheet-nest/`) are in place. The export output and the studio step are still being built; [the plan](plans/sheet-nesting.md) lists the phases.

## Planner

1. **Settings** (`resolve.ts`): `ProjectConfigV1.sheetNesting` holds the sheet size, margin, spacing, rotation mode, time budget and seed. A sheet axis left at 0 takes the machine work area on that axis. The fingerprint ignores this field, so changing it never forces a regenerate.
2. **Parts** (`parts.ts`): each root polygon of a nest family is one rigid part, together with every polygon cut out of it. Seam pieces are already one polygon each. The outline sent to the packer is the kerf envelope of the root's outer ring, thinned to at most 400 vertices. The thinning only ever grows the outline: Douglas-Peucker first, then an outward offset by the same tolerance.
3. **Sheets** (`plan-sheets.ts`): the planner first emits a bounding-box skyline layout (`rectangles.ts`), so a valid plan exists immediately. It then fills one sheet at a time. For each sheet it:
   - picks the largest remaining parts up to a target share of the sheet's area (85%, then lower);
   - asks sparrow to fit them into a strip as tall as the usable sheet, stopping as soon as the strip is no wider than the sheet;
   - commits the sheet, after one top-up attempt with a few more parts.
   Any time left merges the last sheet into the one before it and shortens the last sheet to leave the largest offcut. The result never uses more sheets than the bounding-box layout.
4. **Checking** (`verify.ts`): every layout the engine returns is checked independently before it is used. Each part must be placed once, inside the margin, and at least the spacing from every other part (Clipper offsets, 0.02 mm tolerance). A layout that fails is treated as not fitting.
5. **Identity** (`job-key.ts`): a plan records a hash of the part outlines and layout settings. Regenerating an unchanged design gives the same key, so a saved plan stays usable. A changed design or sheet setting makes it stale.

Layouts stop on time, so the same job can come out differently on a faster machine. The saved plan, not a rerun, is what an export reproduces.

## Engine

The packing engine is [sparrow](https://github.com/JeroenGar/sparrow) by Jeroen Gardeyn (KU Leuven). It is built on [jagua-rs](https://github.com/JeroenGar/jagua-rs), his collision-detection engine. `packages/nest-wasm` compiles both, unmodified, to WebAssembly, and a web worker runs the result, so nothing is sent to a server.

sparrow solves 2D irregular *strip* packing: fit every part into a strip of fixed height and make the strip as short as possible. It first builds a layout, then alternates two phases:
- **Exploration:** shrink the strip and remove the resulting overlaps with a guided local search.
- **Compression:** make finer shrinks later on.

The wrapper fixes a few details:
- **Coordinates:** each placement maps a part's own outline coordinates onto the strip, rotation first and then translation. jagua-rs centres shapes internally, and the export undoes that.
- **Spacing:** jagua-rs keeps items apart by growing each item by half the spacing and shrinking the container by the same amount. That would leave a full `spacing` gap at the sheet edge. The wrapper enlarges the strip to cancel it, so parts may touch the sheet edge but stay `spacing` apart from each other.
- **Fit tolerance:** the collision engine counts touching as overlapping. The wrapper therefore allows outlines to cross the strip edge by a fit tolerance (0.01 mm by default), so a part exactly as tall as the sheet still fits. That is well under a laser kerf.
- **Stopping:** a job stops at its time limit, or earlier once a target width is met. The multi-sheet planner uses the target width to learn quickly whether a set of parts fits one sheet.
- **Threads:** the build is single-threaded. Running in parallel would need cross-origin isolation headers, which the site and the Atomm embed do not send.

Limits of jagua-rs 0.8.3: it ignores holes in parts, and it rejects parts made of several polygons. So a small part is never placed inside a hole of another part.

## Credits and citation

sparrow is MIT-licensed (© 2025 Jeroen Gardeyn, KU Leuven). jagua-rs is licensed under MPL-2.0 and is used unmodified. [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) has the licence texts and source links.

If you publish work that relies on this feature, please cite:

- Jeroen Gardeyn, Greet Vanden Berghe, Tony Wauters. "An open-source heuristic to reboot 2D nesting research." arXiv:2509.13329, 2025. https://doi.org/10.48550/arXiv.2509.13329
- Jeroen Gardeyn, Greet Vanden Berghe, Tony Wauters. "Decoupling Geometry from Optimization in 2D Irregular Cutting and Packing Problems: an Open-Source Collision Detection Engine." INFORMS Journal on Computing. https://doi.org/10.1287/ijoc.2024.1025 (accepted manuscript: arXiv:2508.08341)
