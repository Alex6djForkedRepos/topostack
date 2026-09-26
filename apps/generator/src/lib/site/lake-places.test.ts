import { describe, expect, it } from "vitest";
import directoryJson from "../../../static/data/lake-depth-directory.json";
import lock from "$lib/site/lake-slugs.json";
import type { LakeDirectory, LakeDirectoryEntry } from "$lib/site/lake-directory";
import { buildLakePages } from "$lib/site/lake-pages";
import { buildLakePlaces, eligibleForPlacePage, hasPlaceName, lakePlaceSeo, lakePlaceSlugs, lockLakeSlugs, piecePlans, placeKey } from "$lib/site/lake-places";
import { DEFAULT_SOCIAL_IMAGE } from "$lib/site/site";

const directory = directoryJson as LakeDirectory;
const sources = new Map(directory.sources.map((source) => [source.id, source]));
const slugs = lakePlaceSlugs(directory, lock);
const lists = buildLakePages(directory, slugs);
const places = buildLakePlaces(directory, slugs, lists.trails);
const all = [...places.values()];

describe("per-lake pages", () => {
  it("locks a slug for every eligible lake, so a data release cannot silently drop or rename one", () => {
    // Fails after a lake directory change until `node scripts/build/lock-lake-slugs.mjs` is run.
    expect(lockLakeSlugs(directory, lock)).toEqual(lock);
    const eligible = directory.lakes.filter((lake) => eligibleForPlacePage(lake, sources.get(lake.sourceId)!));
    expect(all).toHaveLength(eligible.length);
    expect(new Set(Object.values(lock)).size).toBe(Object.keys(lock).length);
  });

  it("never changes a locked slug when lakes are added", () => {
    const newcomer: LakeDirectoryEntry = { ...directory.lakes.find((lake) => places.has(`/lake/${lock[placeKey(lake) as keyof typeof lock]}`))!, surveyId: "new-survey" };
    const next = lockLakeSlugs({ ...directory, lakes: [...directory.lakes, newcomer] }, lock);
    for (const [key, slug] of Object.entries(lock)) expect(next[key]).toBe(slug);
    expect(next[placeKey(newcomer)]).toMatch(/-new-survey$/);
  });

  it("gives only substantial, named lakes a page", () => {
    expect(all.length).toBeGreaterThan(2_000);
    expect(all.length).toBeLessThan(directory.lakes.length / 2);
    for (const place of all) expect(hasPlaceName(place.name), place.path).toBe(true);
    expect(hasPlaceName("Unnamed lake near Ely")).toBe(false);
    expect(hasPlaceName("Part of Lake Vermilion")).toBe(false);
    expect(hasPlaceName("59.922.1.036")).toBe(false);
    expect(hasPlaceName("Suontee (N60 94.10)")).toBe(false);
    expect(hasPlaceName("Leech (Main Basin)")).toBe(true);
  });

  it("gives every page a unique path, title and description of search-snippet length", () => {
    expect(new Set(all.map((place) => place.title)).size).toBe(all.length);
    expect(new Set(all.map((place) => place.description)).size).toBe(all.length);
    const listPaths = new Set(lists.pages.keys());
    for (const place of all) {
      expect(place.path).toMatch(/^\/lake\/[a-z0-9-]+$/);
      expect(listPaths.has(place.path)).toBe(false);
      expect(place.title, place.path).toMatch(/ \| TopoStack$/);
      expect(place.description.length, place.path).toBeGreaterThan(90);
      expect(place.description.length, place.path).toBeLessThanOrEqual(200);
    }
  });

  it("links each lake from the list that names it and back again", () => {
    const linked = new Set([...lists.pages.values()].flatMap((page) => page.lakes.flatMap((lake) => lake.page ? [lake.page] : [])));
    expect(linked).toEqual(new Set(places.keys()));
    for (const place of all) {
      const list = lists.pages.get(place.trail.at(-2)!.path);
      expect(list?.lakes.some((lake) => lake.page === place.path), place.path).toBe(true);
      expect(place.trail[0]!.path).toBe("/lakes");
      expect(place.trail.at(-1)!.path).toBe(place.path);
    }
  });

  it("links nearby lakes to pages that exist, or to the studio", () => {
    for (const place of all) {
      expect(place.nearby.length).toBe(6);
      for (const lake of place.nearby) {
        if (lake.hasPage) expect(places.has(lake.href), `${place.path} → ${lake.href}`).toBe(true);
        else expect(lake.href).toMatch(/^\/studio\?lake=/);
        expect(lake.href).not.toBe(place.path);
      }
      expect(place.nearby.map((lake) => lake.distanceKm)).toEqual(place.nearby.map((lake) => lake.distanceKm).toSorted((a, b) => a - b));
    }
  });

  it("describes Crater Lake from its survey footprint", () => {
    const crater = all.find((place) => place.name === "Crater Lake" && place.place === "Oregon")!;
    expect(crater.path).toBe("/lake/crater-lake-oregon");
    expect(crater.title).toBe("Crater Lake Depth Map, Oregon | TopoStack");
    expect(crater.kind).toBe("grid");
    expect(crater.studioPath).toMatch(/^\/studio\?lake=Crater\+Lake&bounds=/);
    const seo = lakePlaceSeo(crater, DEFAULT_SOCIAL_IMAGE);
    expect(seo.canonical).toBe("https://topostack.app/lake/crater-lake-oregon");
    expect(seo.place).toMatchObject({ name: "Crater Lake", containedIn: "Oregon" });
    expect(seo.place!.box.split(" ")).toHaveLength(4);
    expect(seo.breadcrumbs.at(-1)).toEqual({ name: "Crater Lake", item: "https://topostack.app/lake/crater-lake-oregon" });
  });

  it("adds the lake word only where the name lacks one", () => {
    const titles = new Map(all.map((place) => [place.name, place.heading]));
    expect(titles.get("Lake Tahoe")).toBe("Lake Tahoe depth map");
    expect([...titles].find(([name]) => name.endsWith("järvi"))?.[1]).toMatch(/järvi depth map$/);
    expect([...titles].find(([name]) => /^[A-Z][a-z]+$/.test(name) && !/see$/.test(name))?.[1]).toMatch(/ lake depth map$/);
  });

  it("works out piece sizes that keep the survey's shape", () => {
    const [small, medium, large] = piecePlans({ width: 20, height: 10 });
    expect(medium).toEqual({ widthMm: 406.4, heightMm: 203.2, scale: 49_000 });
    expect(small!.scale).toBeGreaterThan(medium!.scale);
    expect(large!.scale).toBeLessThan(medium!.scale);
    const [portrait] = piecePlans({ width: 5, height: 10 });
    expect(portrait!.heightMm).toBe(304.8);
    expect(portrait!.widthMm).toBeCloseTo(152.4);
  });
});
