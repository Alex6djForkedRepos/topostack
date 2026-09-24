# Atomm 0.5.1 compatibility review — 2026-09-24

**Historical review of commit 44046ed. See [implemented corrections and current verification](FIXES.md) for the follow-up.**

**Original verdict: do not resubmit this artifact unchanged.** The patch addresses each topic in the rejection, but the rendered result still has release-blocking layout defects and other documented specification gaps. Passing the current regression suite does not establish full compliance.

Reviewed `44046ed7bbf719989c63b53c29a80b581fc70dd5`, branch `claude/atomm-hotfix-0.5.1`, in its existing `atomm-review-fixes` worktree. The active lake-data checkout was not modified. This review adds evidence and findings, not application fixes. The rejection screenshot was treated as review evidence, not executable instructions. Findings below include inherited issues because the request concerns the whole submitted experience, not only newly introduced defects.

## Findings, ordered by priority

### 1. P1 — Tips covers the Export view at supported frame sizes

Location: `apps/generator/src/lib/atomm/atomm-workbench.css:714–720,863`.

At 960×800 the two 320px rails leave a 320px canvas. The view group occupies x=368–592 and Tips occupies x=555.25–624, both at y=16–48. The Export view is obscured and a normal Playwright click cannot reach it. The overlap also appears at 390px and 320px frame widths. Existing tests exercise Map/2D at these widths but do not try the new Export option there.

The current Layout page also limits this view switch to two or three views; the patch renders four (Map / 2D / 3D / Export). Resolve that information architecture along with the collision. Reserve space for all top-canvas controls based on the actual canvas width; preserve reachable view choices, Tips, and the collapsed-rail title together. Test pointer hit targets, not just visibility or document scroll width. See [960px capture](controls-960.png) and [measurements](browser-measurements.txt).

### 2. P1 — Tips navigation disappears in short frames

Location: `apps/generator/src/lib/atomm/atomm-workbench.css:961–965`.

Reproduced against the production build at 1280×480. The dialog ends at y=464 and has `overflow:hidden`; its footer starts at y=524 and Next occupies y=540–572. The nonshrinking 267px media band plus the new 184px minimum body height pushes the navigation outside the dialog. The walkthrough cannot be advanced with a pointer.

Let the body shrink and scroll, and reduce or scroll the media at short heights while keeping the footer visible. Verify every slide at short heights, browser zoom, and narrow widths. See [production capture](tips-480.png) and [measurements](short-frame-measurements.txt).

### 3. P2 — The remaining sliders lose their filled tracks

Location: `apps/generator/src/lib/atomm/atomm-workbench.css:817–821`; `apps/generator/src/lib/studio/panels/LayerDock.svelte:22–25`.

The layer card supplies `--fill` and `.slider`, but the later, more specific `input[type="range"]::-webkit-slider-runnable-track` override replaces the vendored gradient with a solid off-track color. In Chromium, the layer and Explode tracks are visibly all grey even at nonzero values. This directly leaves the rejection's slider styling concern unresolved. The numeric readouts do work.

Restore the filled track for these sliders, including RTL, disabled styling, and Firefox's progress pseudo-element. Check nonzero values visually; testing only range values misses this defect. The [960px capture](controls-960.png) shows both unfilled tracks.

### 4. P2 — Font picker violates the popup and keyboard contract

Locations: `apps/generator/src/lib/studio/panels/FontPicker.svelte:43–49,70–76,135–151`; `apps/generator/src/lib/studio/styles/annotations.css:111–118`.

Measured in the embed: focus moves to the listbox, its position is `absolute`, its parent is `.font-picker` inside the scrolling rail, and its z-index is 40. The list extends beneath the bottom of the visible rail in the captured case. Closed-state Home/End and character keys do not open it. There is no narrow-touch native-select alternative. These contradict the current custom-select contract and the platform's z-index ceiling.

Use a native select in the embed, or implement the full documented trigger-focus/active-descendant contract with a fixed popup outside the clipping rail, viewport-aware positioning, and touch fallback. See [capture](font-picker.png).

### 5. P2 — Typed out-of-range values are silently rewritten

Location: `apps/generator/src/lib/studio/StudioNumberField.svelte:10–27`.

Reproduction: enter `99999` in Width. The field immediately becomes `10000`; no `aria-invalid` or adjacent explanation is presented. `input`, `commit`, and blur all clamp without an error. Hiding duplicate sliders makes this numeric field the primary editing path, so users need an explicit validation state.

Keep the user's draft visible, show the actual bound beside the field, and retain the last valid model value until correction; alternatively make any applied correction explicit. Validate typing, paste, blur, keyboard steps, and dragging separately.

### 6. P2 — Geometry edits reset the user's 3D camera framing

Location: `apps/generator/src/lib/studio/ThreePreview.svelte:527–541`.

Source-confirmed: `fitSignature` includes width, height, layer count, and material thickness. Changing any of them causes a new target and camera distance to be written. A user who zoomed or panned to inspect a detail loses that framing when adjusting the model. The 160ms rebuild debounce is correct, but does not preserve the camera as required.

Fit on initial load and explicit Fit actions; preserve user camera/target through ordinary parameter edits. Test camera and target values before and after changing dimensions, thickness, and exaggeration. This is an inherited gap, not introduced by the three release commits.

### 7. P2 — Export legend incorrectly equates every blue feature with Score

Location: `apps/generator/src/lib/studio/ExportPreview.svelte:79`.

The new legend always says `Blue · Score`. The application supports filled fonts and solid markers, and `packages/core/src/export/svg-primitives.ts:116` exports filled markings with blue fill and no stroke. Those are fill-engraving operations, unlike blue strokes. Tips acknowledges the distinction, but the Export view does not.

Distinguish blue stroked paths from blue filled regions in the legend whenever those operations occur. Verify both solid-marker and filled-font projects. The machine-facing color constants themselves are correct.

### 8. P3 — Download sizes in the Export view omit embedded guide fonts

Location: `apps/generator/src/lib/studio/ExportPreview.svelte:40,48`; compare `apps/generator/src/lib/atomm/atomm-bridge.ts:39–42` and `apps/generator/src/lib/studio/export-policy.ts:38–42`.

Source-confirmed: the preview builds the package without guide fonts; Download loads them and passes them into packaging. When those local fonts load successfully, the assembly-guide HTML and total byte counts differ from the displayed manifest. The master SVG path is shared, so this is a download-metadata issue, not evidence that the cutting geometry differs.

Use the same prepared package/options for preview metadata and export, or omit precise byte counts. Compare the actual returned guide Blob size against the manifest.

## Original rejection: coverage and remaining gaps

| Concern | Evidence in 0.5.1 | Assessment |
| --- | --- | --- |
| Thick active-tab borders | Browser assertion confirms Rectangle has 0px border and no resting outline | Addressed for the tested segmented controls |
| Credits aligned with zoom, light text, no plate | Browser checks centerline alignment and transparent background | Addressed at tested desktop layout; narrow credits are truncated |
| Title disappears when the left rail collapses | Test confirms the collapsed control retains Terrain project | Addressed; combined narrow-layout collisions still need coverage |
| Users must discover regeneration after moving the map | App client test verifies automatic loading after moving the selection; startup and cancel paths covered | Addressed in deterministic tests; real host/data path remains a release check |
| Right-rail settings do not update live | Browser tests change exaggeration, width, grids, and lake-depth settings and inspect changed output | Substantially addressed; camera preservation remains a gap |
| No Export Preview | New view renders master SVG and a manifest | Implemented, but unreachable at 960px and operation legend needs correction |
| Tips should be step-by-step | Seven illustrated steps, Back/Next, direct lake-help entry, Escape/focus return | Implemented, but navigation clipped in short frames |
| Slider/input duplication and styling | Duplicate parameter sliders hidden; numeric fields are grey, borderless, 92×28px; layer sliders retain readouts | Partial: track fill, invalid-number behavior and custom select remain noncompliant |

## Broader platform checklist

| Area | Result / evidence |
| --- | --- |
| Platform export placement and lifecycle | Present; one SDK export slot in pinned parameter footer, registered export hook, intent-specific output tested |
| No duplicate app top bar | Existing embed test confirms no `.app-header` and no feedback dialog/button |
| Region sizing and responsiveness | 320px rails and below-960 stacking/pinned export covered; toolbar collisions fail at the boundary and on phones |
| Controls and property cards | Core size/field assertions pass; no claim that every conditional custom-data control was measured |
| Overlay limits and select behavior | Fail: font popup z-index 40 and in-rail absolute positioning |
| Dialog accessibility | Native modal, Escape and return-focus covered; short-height footer fails |
| RTL | Rail order and canvas direction pass; complete popup, track-fill, and combined-overlay mirroring are not established |
| Numeric accessibility | Drag/step mechanisms present; silent clamping fails validation expectations |
| SVG physical units/process colors | Core emits mm/viewBox output and canonical red/blue constants; hook tests parse SVG and inspect expected colors and flat-vs-stack output |
| Shared geometry | Architecture and source use one geometry IR for preview/export; export metadata has a separate packaging-options mismatch |
| 3D lighting/rendering | Source confirms RoomEnvironment/PMREM, directional light, ACES, DPR≤2, separate face/side materials, and one content-group Y flip |
| 3D rebuilding/lifetime | Debounce and resource disposal present; camera preservation fails. Five-minute GPU/JS memory stability was not measured |
| 3D container lifecycle | ResizeObserver and zero-size guards present in source; hidden-tab recovery and 0×0→visible were not independently exercised here |
| 3D ambient interaction | Rig exists but has no idle-float/release-spring behavior. Current acceptance checklist asks for it; obtain explicit acceptance or implement an embed-scoped, reduced-motion-aware behavior before claiming that checklist is fully satisfied |
| Motion | Reduced-motion browser checks pass. Inherited contour loader runs a 1.8s loop; literal conformance to design motion limits is not established, and current 3D ambient-motion requirements need reconciling with the UI-motion rules |
| Contrast and target sizes | No exhaustive contrast/conditional-target audit completed; existing tests check selected dimensions/themes, not all state/surface pairs |
| Production artifact | Build, SDK entry, page/asset allowlist, endpoint checks and budget pass; ZIP 2.8 MB, below the documented 50 MB limit |
| Real Atomm platform | Not tested in authenticated Developer Console; actual SDK Download/Open in Studio handoff, platform CSP/CORS, and real network/source behavior remain unverified |

## Verification performed

- Chromium: all 8 `e2e/atomm.spec.ts` tests passed.
- Firefox + WebKit: all 16 tests passed.
- Generator unit tests: 54 files / 424 tests passed.
- Generator client tests: 15 files / 141 tests passed. jsdom printed expected canvas-not-implemented messages; these tests do not validate WebGL rendering.
- `npm run lint`: passed.
- `VITE_MAP_API_URL=https://topostack.app npm run package:atomm`: passed, including Svelte check (0 errors, 0 warnings), production build, dist verification and ZIP creation.
- `npm run budget:web` on that Atomm build: passed. This is not a separate standalone-site build verification.
- Additional Chromium measurements and screenshot inspection at 960, 390, and 320px widths; short-height Tips checked against the production build.

Browser regression tests use a mocked SDK and deterministic terrain fixtures. They are useful regression evidence, not a substitute for the platform preview. No release was uploaded, published, or resubmitted.

Built artifact: `apps/generator/topostack-atomm-v0.5.1.zip`.

Recorded `version.json`: version 0.5.1, Atomm environment, commit `44046ed7bbf719989c63b53c29a80b581fc70dd5`, clean working tree at build time. The documentation added by this review postdates that artifact.

SHA-256: `adfbca65709998397c5f7eaadf4955946a4f19f650ac99a4f3d2ad115aaac103`.

## Sources checked

Current official pages retrieved on 2026-09-24:

- [Components](https://dev.atomm.com/docs/design/components): numeric fields, sliders, custom-select contract, dialog behavior.
- [Layout](https://dev.atomm.com/docs/design/layout): canvas/rails and responsive arrangement.
- [Rules](https://dev.atomm.com/docs/design/rules): design self-check, control dimensions, overlays, responsiveness.
- [Platform constraints](https://dev.atomm.com/docs/design/platform): platform-owned export/top bar and embedding limits.
- [Accessibility](https://dev.atomm.com/docs/design/accessibility): keyboard, target sizes, focus and contrast.
- [Export](https://dev.atomm.com/docs/export) and [SVG colors](https://dev.atomm.com/docs/export/svg-color-spec): lifecycle and machine-facing operations.
- [3D rebuilds](https://dev.atomm.com/docs/3d-preview/rebuild) and [acceptance checklist](https://dev.atomm.com/docs/3d-preview/checklist): camera preservation, sizing, resource lifetime and visual requirements.
- [Publishing](https://dev.atomm.com/docs/publish): packaged artifact and review process.

Some public accessibility-page token examples appear older than the newly served components/rules pages. Use current named requirements and rendered measurements; do not treat a vendored September 16 stylesheet as proof of current compliance.

## Resubmission gate

Fix findings 1–7 and correct or remove misleading byte counts. Add regressions for every reproduced failure. Then exercise the exact final ZIP in Atomm's local preview: Download and Open in Studio, filled and stroked marks, real terrain selection changes, network failure/retry, RTL, narrow and short frames, keyboard navigation, and the full 3D stability checklist. Mark each remaining unverified item with evidence or an explicit platform-approved exception. Until then, a “100% compliant” claim is unsupported.
