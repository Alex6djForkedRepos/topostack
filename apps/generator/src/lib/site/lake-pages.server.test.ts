import { describe, expect, it } from "vitest";
import previewPin from "$lib/site/lake-previews.json";
import { LAKE_PAGES, LAKE_PLACES, LAKE_REGIONS, lakePageIndex, lakePreview } from "$lib/site/lake-pages.server";

describe("links into per-lake pages", () => {
  it("indexes every lake page by directory id for the search", () => {
    const { schemaVersion, pages } = lakePageIndex();
    expect(schemaVersion).toBe(1);
    expect(Object.keys(pages)).toHaveLength(LAKE_PLACES.size);
    for (const place of LAKE_PLACES.values()) expect(`/lake/${pages[place.id]}`).toBe(place.path);
  });

  it("links the region index's featured lakes to their pages where they have one", () => {
    const featured = LAKE_REGIONS.flatMap((region) => LAKE_PAGES.get(region.path)!.largest);
    const linked = featured.filter((lake) => lake.page);
    expect(linked.length).toBeGreaterThan(featured.length / 2);
    for (const lake of linked) expect(LAKE_PLACES.has(lake.page!), lake.name).toBe(true);
  });
});

describe("lake depth previews", () => {
  it("resolves a pinned preview to its Worker URL and survey names, and nothing otherwise", () => {
    const pin = { "crater-lake-oregon": { file: `${"a".repeat(24)}.webp`, width: 960, height: 854, maxDepthM: 592.1, contourIntervalM: 100, surveyedShare: 0.99, surveys: ["usgs-crater-lake-v1"] } };
    expect(lakePreview("crater-lake-oregon", pin)).toEqual({ src: `/v1/lake-previews/${"a".repeat(24)}.webp`, width: 960, height: 854, maxDepthM: 592.1,
      contourIntervalM: 100, surveyedShare: 0.99, surveys: ["USGS Crater Lake multibeam bathymetry"] });
    expect(lakePreview("pelican-crow-wing-county-minnesota", pin)).toBeUndefined();
  });

  it("only pins previews for lakes that have a page", () => {
    for (const slug of Object.keys(previewPin.lakes)) expect(LAKE_PLACES.has(`/lake/${slug}`), slug).toBe(true);
  });
});
