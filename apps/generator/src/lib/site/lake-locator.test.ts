import { describe, expect, it } from "vitest";
import locatorData from "$lib/site/locator-data.json";
import { LAKE_PLACES, lakeLocator } from "$lib/site/lake-pages.server";
import { LOCATOR_HEIGHT, LOCATOR_WIDTH, buildLocator, locatorWindow, type LocatorData } from "$lib/site/lake-locator";

const data = locatorData as LocatorData;
const numbers = (path: string): number[] => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe("lake locator maps", () => {
  it("shows at least 400 km, and three times a large survey area", () => {
    const small = locatorWindow([-94.3, 46.5, -94.2, 46.6]);
    expect((small[2] - small[0]) * 111.32 * Math.cos(46.55 * Math.PI / 180)).toBeCloseTo(400, 0);
    const superior = LAKE_PLACES.get("/lake/lake-superior-great-lakes-usa-canada")!;
    const [west, south, east, north] = locatorWindow(superior.bounds);
    // The longer side relative to the map's 8:5 shape sets the size; neither side gets less than three times.
    expect(east - west).toBeGreaterThanOrEqual(3 * (superior.bounds[2] - superior.bounds[0]) - 1e-9);
    expect(north - south).toBeGreaterThanOrEqual(3 * (superior.bounds[3] - superior.bounds[1]) - 1e-9);
    expect(Math.min((east - west) / (superior.bounds[2] - superior.bounds[0]), (north - south) / (superior.bounds[3] - superior.bounds[1]))).toBeCloseTo(3, 5);
  });

  it("keeps every drawn coordinate inside the map", () => {
    for (const path of ["/lake/crater-lake-oregon", "/lake/lake-superior-great-lakes-usa-canada", "/lake/bodensee-switzerland", "/lake/mjosa-norway"]) {
      const map = lakeLocator(LAKE_PLACES.get(path)!.id)!;
      for (const layer of [map.land, map.lakes, map.states, map.countries]) {
        const values = numbers(layer);
        for (let i = 0; i < values.length; i += 2) {
          expect(values[i]!, path).toBeGreaterThanOrEqual(0);
          expect(values[i]!, path).toBeLessThanOrEqual(LOCATOR_WIDTH);
          expect(values[i + 1]!, path).toBeGreaterThanOrEqual(0);
          expect(values[i + 1]!, path).toBeLessThanOrEqual(LOCATOR_HEIGHT);
        }
      }
    }
  });

  it("marks a survey area too small to see and thins dots to one per cell", () => {
    const map = buildLocator([-94.3, 46.5, -94.29, 46.51], data, [[-94.0, 46.6], [-94.0001, 46.6001], [-93.0, 46.0], [-60, 10]]);
    expect(map.marker).toBeDefined();
    expect(map.marker!.x).toBeCloseTo(LOCATOR_WIDTH / 2, 0);
    // Two lakes a few metres apart share a cell; the lake far outside the map is dropped.
    expect(map.dots).toHaveLength(2);
    expect(map.scale.km).toBe(50);
    const large = buildLocator([-92.5, 46.3, -84.3, 49.0], data, []);
    expect(large.marker).toBeUndefined();
    expect(large.box.width).toBeCloseTo(LOCATOR_WIDTH / 3, 0);
  });

  it("gives every lake page a map with land, at a size the page can carry", () => {
    const sizes: number[] = [];
    for (const place of LAKE_PLACES.values()) {
      const map = lakeLocator(place.id)!;
      expect(map.land.length, place.path).toBeGreaterThan(0);
      sizes.push(map.land.length + map.lakes.length + map.states.length + map.countries.length + map.dots.length * 12);
    }
    sizes.sort((a, b) => a - b);
    expect(sizes[Math.floor(sizes.length / 2)]).toBeLessThan(12_000);
    expect(sizes.at(-1)).toBeLessThan(45_000);
  });
});
