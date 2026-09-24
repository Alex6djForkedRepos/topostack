# Sheet nesting

Sheet nesting arranges a project's cut parts on as few stock sheets as possible. Parts are moved and, if the settings allow it, rotated. This differs from the *material nests* that generation already plans (see [architecture.md](architecture.md)). A material nest cuts a smaller layer from the waste of a lower layer at the same position, and nothing moves. Sheet nesting runs after that step and treats each nest family as a single rigid part.

Status: the packing engine is in place (`packages/nest-wasm`). The multi-sheet planner, the export output and the studio step are still being built; [the plan](plans/sheet-nesting.md) lists the phases.

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
