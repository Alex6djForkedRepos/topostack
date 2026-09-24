# Walden Pond — announcement images

Use **walden-reviewed-workspace.png** as the main forum image: it shows the real source chart, reviewed contour overlay, representative wood layers, and depth map together. **walden-contour-editing.png** is the companion image for the new editing tools. **walden-generated-terrain.png** shows the saved chart applied to a terrain project.

Suggested caption:

> Walden Pond, built from a manually reviewed USGS depth chart in TopoStack. Inspect and repair contours, assign depths, then preview the generated lake floor and layers. Chart: U.S. Geological Survey.

This example simplifies several small shoals and uses approximate map-outline registration. It demonstrates the workflow; it is not an automatic-tracing or survey-accuracy claim. Generation retains the incomplete-coverage warning. The layer preview is representative, while the terrain image is a generated project; neither is a photograph of a physical cut.

The source chart is from the [USGS Walden Pond report cover](https://pubs.usgs.gov/wri/wri014137/pdf/cover.pdf). Retain the map attribution in the terrain screenshot. See [reproduction and validation](../../../scripts/verify/walden-example/README.md) for source hashes, corrections, and limits.

`walden-project.json` includes the reviewed chart and project settings; import it in the studio and regenerate terrain to explore the example.
