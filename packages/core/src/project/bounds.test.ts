import { describe, expect, it } from "vitest";
import { boundsAround, coverBounds, fitCutBounds, isMercatorBounds, latToWorldY, worldYToLat, zoomForBounds } from "./bounds.js";

const mercatorAspect = (bounds: { west: number; east: number; south: number; north: number }) =>
  ((bounds.east - bounds.west) * Math.PI / 180) / (Math.asinh(Math.tan(bounds.north * Math.PI / 180)) - Math.asinh(Math.tan(bounds.south * Math.PI / 180)));

describe("project bounds", () => {
  it("round-trips latitude through world pixels", () => {
    for (const lat of [-80, -12.5, 0, 46.85, 85]) expect(worldYToLat(latToWorldY(lat, 10), 10)).toBeCloseTo(lat, 9);
  });

  it("centers a ground width on a point at the cut's proportions", () => {
    const bounds = boundsAround({ lat: 60, lon: 10 }, 50, 300, 150);
    expect(mercatorAspect(bounds)).toBeCloseTo(2, 9);
    expect((bounds.west + bounds.east) / 2).toBeCloseTo(10, 9);
    // At 60° a degree of longitude is half as long, so 50 km spans about 0.9°.
    expect(bounds.east - bounds.west).toBeCloseTo(50 / (6371.0088 * Math.PI / 180 * 0.5), 6);
  });

  it("covers a box that fitting would crop, and fitting leaves covered bounds alone", () => {
    const tall = { west: 8, south: 46, east: 8.02, north: 47 };
    const covered = coverBounds(tall, 300, 200);
    expect(covered.south).toBeCloseTo(tall.south, 9);
    expect(covered.north).toBeCloseTo(tall.north, 9);
    expect(covered.east - covered.west).toBeGreaterThan(tall.east - tall.west);
    expect(fitCutBounds(covered, 300, 200)).toBe(covered);
  });

  it("recognises bounds the tiles can serve", () => {
    expect(isMercatorBounds({ west: -10, south: -10, east: 10, north: 10 })).toBe(true);
    expect(isMercatorBounds({ west: 170, south: 0, east: 190, north: 1 })).toBe(false);
    expect(isMercatorBounds({ west: 0, south: 80, east: 1, north: 86 })).toBe(false);
    expect(isMercatorBounds({ west: 1, south: 0, east: 0, north: 1 })).toBe(false);
  });

  it("frames bounds at the zoom a map camera would", () => {
    expect(zoomForBounds({ west: 0, south: 0, east: 0.3, north: 0.2 })).toBe(10);
    expect(zoomForBounds({ west: -180, south: -80, east: 180, north: 80 })).toBe(3);
    expect(zoomForBounds({ west: 0, south: 0, east: 0.0001, north: 0.0001 })).toBe(14);
  });
});
