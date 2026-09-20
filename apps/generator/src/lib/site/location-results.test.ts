import { describe, expect, it } from "vitest";
import { indexLakeDirectory, type LakeDirectory } from "$lib/site/lake-directory";
import { uniqueLocationLakes, uniqueOtherPlaces } from "$lib/site/location-results";

const directory: LakeDirectory = {
  schemaVersion: 1, updated: "2026-09-16",
  sources: [{ id: "survey", name: "Survey", url: "https://example.com", license: "public", kind: "grid", region: "Test", group: "Test" }],
  lakes: [{ id: "one", name: "Lake Léman", aliases: ["Lake Geneva"], sourceId: "survey", surveyId: "1", region: "Test", bounds: [6, 46, 7, 47] }],
};
const lake = indexLakeDirectory(directory)[0]!;

describe("location choices", () => {
  it("collapses repeated records while preserving same-named lakes elsewhere", () => {
    const elsewhere = { ...lake, id: "two", surveyId: "2", bounds: [8, 48, 9, 49] as [number, number, number, number] };
    expect(uniqueLocationLakes([lake, { ...lake }, { ...lake, id: "copy", surveyId: "copy" }, elsewhere])).toEqual([lake, elsewhere]);
  });

  it("prefers surveyed lakes over geocoder duplicates, including aliases, without hiding nearby towns or distant namesakes", () => {
    const places = [
      { id: "alias", label: "Lake Geneva, Switzerland", lat: 46.5, lon: 6.5 },
      { id: "accent", label: "Lake Leman, Switzerland", lat: 46.5, lon: 6.5 },
      { id: "town", label: "Geneva, Switzerland", lat: 46.5, lon: 6.5 },
      { id: "distant", label: "Lake Geneva, USA", lat: 42, lon: -88 },
    ];
    expect(uniqueOtherPlaces([...places, { ...places[2]!, id: "town-copy" }], [lake])).toEqual(places.slice(2));
    expect(uniqueOtherPlaces(places, [])).toEqual(places);
  });
});
