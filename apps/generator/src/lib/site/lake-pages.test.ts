import { describe, expect, it } from "vitest";
import directoryJson from "../../../static/data/lake-depth-directory.json";
import type { LakeDirectory } from "$lib/site/lake-directory";
import { LAKE_REGIONS, buildLakePages, lakePageSeo, lakeRegionCard } from "$lib/site/lake-pages";

const directory = directoryJson as LakeDirectory;
const { pages, regions } = buildLakePages(directory);
const all = [...pages.values()];

describe("generated lake pages", () => {
  it("lists every lake in the directory exactly once across the region's pages", () => {
    const listedIn = new Map<string, number>();
    for (const page of all) for (const lake of page.lakes) {
      const key = `${lake.name}|${lake.bounds.join(",")}`;
      listedIn.set(key, (listedIn.get(key) ?? 0) + 1);
    }
    const expected = new Map<string, number>();
    for (const lake of directory.lakes) {
      const key = `${lake.name}|${lake.bounds.join(",")}`;
      expected.set(key, (expected.get(key) ?? 0) + 1);
    }
    expect(listedIn).toEqual(expected);
    expect(regions.reduce((sum, region) => sum + region.count, 0)).toBe(directory.lakes.length);
  });

  it("keeps each page small enough to prerender as plain HTML", () => {
    for (const page of all) expect(page.lakes.length, page.path).toBeLessThanOrEqual(400);
  });

  it("gives every page a unique path, title and description of search-snippet length", () => {
    expect(new Set(all.map((page) => page.title)).size).toBe(all.length);
    expect(new Set(all.map((page) => page.description)).size).toBe(all.length);
    for (const page of all) {
      expect(page.path, page.path).toMatch(/^\/lakes\/[a-z0-9-]+(\/[a-z0-9-]+)?$/);
      expect(page.title, page.path).toMatch(/ \| TopoStack$/);
      expect(page.description.length, page.path).toBeGreaterThan(90);
      expect(page.description.length, page.path).toBeLessThanOrEqual(200);
      expect(page.updated <= new Date().toISOString().slice(0, 10), page.path).toBe(true);
    }
  });

  it("links every sub-page from its region and back through the breadcrumb trail", () => {
    for (const page of all) {
      expect(page.trail[0]).toEqual({ path: "/lakes", label: "Lake depth maps" });
      expect(page.trail.at(-1)!.path).toBe(page.path);
      const parent = page.trail.at(-2)!.path;
      if (parent !== "/lakes") expect(pages.get(parent)!.children.map((child) => child.path), page.path).toContain(page.path);
    }
    const seo = lakePageSeo(pages.get("/lakes/minnesota/crow-wing-county")!);
    expect(seo.breadcrumbs.map((crumb) => crumb.name)).toEqual(["TopoStack", "Lake depth maps", "Minnesota", "Crow Wing County"]);
    expect(seo.canonical).toBe("https://topostack.app/lakes/minnesota/crow-wing-county");
  });

  it("shares each region's card with its county, state and letter-range pages", () => {
    for (const page of all) {
      const region = page.trail[1]!.path.split("/")[2]!;
      expect(lakePageSeo(page).image, page.path).toEqual(lakeRegionCard(region));
    }
    expect(lakePageSeo(pages.get("/lakes/minnesota/crow-wing-county")!).image.url).toBe("/images/cards/lakes-minnesota.jpg");
    expect(new Set(LAKE_REGIONS.map((region) => lakeRegionCard(region.slug).url)).size).toBe(LAKE_REGIONS.length);
    expect(() => lakeRegionCard("atlantis")).toThrow(/atlantis/);
  });

  it("refuses a lake source that no region page covers", () => {
    const orphan = { ...directory.sources[0]!, id: "new-source-v1" };
    expect(() => buildLakePages({ ...directory, sources: [...directory.sources, orphan] })).toThrow(/new-source-v1/);
  });
});
