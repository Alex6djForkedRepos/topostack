import { describe, expect, it } from "vitest";
import { LAKE_PAGES, LAKE_PLACES, LAKE_REGIONS, lakePageIndex } from "$lib/site/lake-pages.server";

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
