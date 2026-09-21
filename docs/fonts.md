# Engraving fonts

Labels (elevations, roads, scale bar, assembly ids) use the project's `textStyle.font`. The title uses `plaque.font` when it is set, and otherwise the label font. The north arrow's letters always use the built-in Technical style.

## Three kinds

| Kind | Fonts | Engraves as | Coverage |
| --- | --- | --- | --- |
| Built-in (`bitmap`) | Technical, Rounded, Stencil | Short strokes drawn from a 5-row bitmap table in `packages/core/src/annotate/labels.ts` | Capitals, digits, common punctuation; titles are capitalized |
| Single line | Hershey Sans, Hershey Serif, Hershey Script, Relief SingleLine | Open strokes, one laser pass per line, round caps | Printable ASCII and Latin-1 accents (é, ü, ñ, Å); Relief also covers Latin Extended-A (ł, ő, č) |
| Outline | Jost, Oswald, Lora, Roboto Slab | Filled regions (`fill-rule="evenodd"`, no stroke) in the same ENGRAVE groups | Printable ASCII, Latin-1, Latin Extended-A, common typographic marks |

`sizeMm` is the cap height for every font. For a typeface the text box is measured from the cap line to the lowest descender, so collision checks and the title footprint cover descenders. A character a font lacks draws as that font's `?`, and the studio lists it under the title field.

Outline letters are areas, which follows the rule for marker artwork: they are not cut back by marker clearance, and on a layered model each piece of a letter is engraved on the sheet where it is exposed (`markerLayerPolygons`). When a seam cuts through a label, each sheet gets its share of each letter as a closed fill.

## Glyph data

`scripts/build/build-font-glyphs.mjs` reads each source in `assets/fonts/<id>/`: TrueType through `opentype.js`, which is a dev dependency only, or SVG fonts for the single-line faces. It keeps the character subset, rounds coordinates to font units, keeps kerning between letters, digits and basic punctuation, and writes:

- `apps/generator/src/lib/domain/font-glyphs/<id>.json`: `FontGlyphsV1` (see `annotate/font-data.ts`). Each glyph is an advance and a path of absolute integer `M/L/Q/C/Z` commands, y up from the baseline.
- `apps/generator/src/lib/studio/font-samples.ts`: an "Aa 123" path per font, so the picker shows every font without loading any.

The glyph files are static assets that are fetched on first use (`$lib/domain/fonts.ts`), so they cost nothing at startup and do not count toward the JavaScript budgets. Gzipped sizes when they were added (2026-09-21): Hershey 5–8 kB each, Relief 13 kB, Oswald 35 kB, Jost 36 kB, Roboto Slab 40 kB, Lora 58 kB. EB Garamond was tried and left out because its dense outlines came to 107 kB.

Core flattens curves to about 1/700 em (under 0.01 mm on a 6 mm title), so every path it writes is M/L only. The clearance clipper in `export/svg-primitives.ts` depends on that. Outline contours are merged under the non-zero rule, so the overlapping contours of variable fonts fill correctly.

## Loading and the registry

Core has no fetch. A host calls `registerFont(decodeFontGlyphs(json))` in each realm that draws text. The studio's `ensureFonts(projectFonts(config))` runs in `PreviewPipeline.generate`, for the page's previews and exports, and in the geometry worker, which has its own registry. Drawing an unregistered typeface throws `FontNotLoadedError` and never substitutes another font. A failed fetch surfaces as a generation error that names the font, and the next edit retries it.

## Glyph data is immutable

The project fingerprint covers the font id but not its glyphs, and most labels are drawn from the stored text when a file is exported. If a released glyph file changed, existing projects would export different letters with no prompt to regenerate. To change a typeface, add it under a new id, or bump the fingerprint prefix as described in [architecture.md](architecture.md#versioning). `scripts/test/font-glyphs.test.mjs` fails when the committed files no longer match their sources.

## Adding a typeface

1. Put the source file and its licence in `assets/fonts/<id>/`. Use SIL OFL, Apache 2.0 or public-domain fonts only.
2. Add the id to `TEXT_FONTS` in `packages/core/src/types.ts` and an entry to `FONT_CATALOG` with its kind and credit. Also add it to `FONT_SOURCES` in the build script.
3. Run `node scripts/build/build-font-glyphs.mjs`, and check the gzipped size of the new JSON.
4. Mention it in the map-details guide. The attribution page lists the catalog on its own.

## Licences

The full texts are next to the sources in `assets/fonts/`. Jost, Oswald, Lora and Relief SingleLine use the SIL Open Font License 1.1, and Roboto Slab uses the Apache License 2.0. The Hershey fonts come with a use notice that requires their acknowledgement to be distributed with the font data. The [attribution page](https://topostack.app/attribution#fonts) carries that acknowledgement.
