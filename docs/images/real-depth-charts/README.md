# Real depth-chart screenshots

Captured from the local app on 2026-09-23 using an actual USGS Walden Pond chart, real map outlines, and the browser trace worker. These images show **validated UI behavior with unresolved tracing-quality warnings**, not an accuracy-approved bathymetric model. They have not been added to the public guide pages.

| Image | Suggested guide use / caption |
| --- | --- |
| `walden-point-entry.png` | “Select a contour and enter the value printed on it. Walden Pond uses metres and a 2 m interval.” The visible point is a source-verified 10 m contour. |
| `walden-trace-review.png` | “Compare the result with the original chart before saving. More points improve coverage, but shoreline-fit warnings still need investigation.” This run uses 18 lake labels, reaches 93% contour coverage, and retains the 88% fit warning. |
| `walden-generated-stack.png` | “Import your chart with its project file, then generate terrain for that lake.” This live Walden terrain has 11 layers and 11 cut panels; chart/fallback warnings and OpenStreetMap attribution remain visible. |
| `walden-shaded-dem.png` | “Switch between the stack and shaded DEM to inspect the traced basins.” This is the same imperfect trace, not a separately validated survey. |

The active terrain project in the three chart-preparation captures is Crater Lake; custom chart preparation is independent of that project's location. The screenshot sequence validates chart preparation, previewing, saving, applying, exporting, and restoring. The main report distinguishes this from live terrain generation.

Credit: U.S. Geological Survey, Colman and Friesz, *Geohydrology and Limnology of Walden Pond, Concord, Massachusetts*, Water-Resources Investigations Report 01-4137, [cover chart](https://pubs.usgs.gov/wri/wri014137/pdf/cover.pdf). USGS-authored material is public domain under the [USGS copyrights policy](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits).

Preparation: crop the source PDF to `[710, 285, 1130, 548]` in top-left page points, render at 288 dpi, and retain dark blue ink (`R < 90`, `G < 145`, `B < 200`) as black on white. No contour geometry or printed depths were invented. A rectangular crop retains the small legend; the automated sample list excludes every label outside the source water boundary. Screenshot warnings are left visible. Screenshots themselves are unedited.

Full sheets, rejected traces, mobile overlap evidence, exported projects, and all raw run receipts remain under `.topostack/real-chart-stress/`. Do not use their screenshots as successful tracing examples. See [the validation report](../../reports/real-depth-chart-stress-2026-09-23.md) and its reproduction instructions before promoting these images into guides.

## Independent accuracy follow-up

The [broad accuracy report](../../reports/chart-tracing-accuracy-2026-09-23.md) found substantial raster basin distortion against independent survey QA points. It does not approve the Walden screenshots for accurate fabrication. `viking-accuracy-comparison.png` and `raster-appearance-stress.png` are measured diagnostic plots, not screenshots; they may illustrate the report's findings with its limitations and source credits intact.

`viking-fabrication-comparison.png` is an unedited browser screenshot of the actual app preview components mounted in a labeled diagnostic comparison. Both rendered 12 sheets. Caption: “Viking raster and curated vector previews: independent QA shows substantially different basin fidelity. Representative layers are not approval for physical cutting.” Source: USGS SIM 3486, Lake Viking sheet 7 and associated 2019 QA soundings linked in the accuracy report.
