import { describe, expect, it } from "vitest";
import { MAX_CUSTOM_DATA_POINTS, MAX_CUSTOM_LINE_POINTS, type GeoPoint } from "@topostack/core";
import { countOutside, detectGeoFormat, fitToCapacity, parseGeoFile, simplifyToLimit } from "$lib/domain/geo-import";

const wiggle = (count: number, lat = 46): GeoPoint[] => Array.from({ length: count }, (_, index) => ({ lat: lat + index * 1e-5, lon: -121 + Math.sin(index / 9) * 1e-3 }));

describe("geo file detection", () => {
  it("uses the extension first, then sniffs the content", () => {
    expect(detectGeoFormat("", "Hike.GPX")).toBe("gpx");
    expect(detectGeoFormat("", "park.kml")).toBe("kml");
    expect(detectGeoFormat("", "trail.geojson")).toBe("geojson");
    expect(detectGeoFormat("  {\"type\":\"Feature\"}", "export.json")).toBe("geojson");
    expect(detectGeoFormat("<?xml version=\"1.0\"?><gpx version=\"1.1\">", "track.xml")).toBe("gpx");
    expect(detectGeoFormat("<kml xmlns=\"http://www.opengis.net/kml/2.2\">", "")).toBe("kml");
    expect(detectGeoFormat("name,lat,lon", "points.csv")).toBeUndefined();
    expect(() => parseGeoFile("name,lat,lon", "points.csv")).toThrow(/GPX, KML or GeoJSON/);
  });
});

describe("GeoJSON import", () => {
  it("maps points, lines and polygon outlines, including collections", () => {
    const collection = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [-122.1, 42.9] } },
        { type: "Feature", geometry: { type: "MultiPoint", coordinates: [[-122.2, 42.95], [-122.25, 42.96]] } },
        { type: "Feature", geometry: { type: "LineString", coordinates: [[-122.1, 42.9, 1800], [-122.12, 42.91], [-122.12, 42.91], [-122.14, 42.93]] } },
        { type: "Feature", geometry: { type: "MultiLineString", coordinates: [[[-122, 43], [-122.01, 43.01]], [[-122.3, 43], [-122.31, 43.01]]] } },
        { type: "Feature", geometry: { type: "Polygon", coordinates: [[[-122, 42.8], [-121.9, 42.8], [-121.9, 42.9], [-122, 42.8]], [[-121.95, 42.82], [-121.94, 42.83], [-121.95, 42.82]]] } },
        { type: "Feature", geometry: { type: "GeometryCollection", geometries: [{ type: "Point", coordinates: [-122.5, 43.1] }] } },
        { type: "Feature", geometry: null },
      ],
    };
    const data = parseGeoFile(JSON.stringify(collection), "features.geojson");
    expect(data.markers).toEqual([{ lat: 42.9, lon: -122.1 }, { lat: 42.95, lon: -122.2 }, { lat: 42.96, lon: -122.25 }, { lat: 43.1, lon: -122.5 }]);
    expect(data.lines.map((line) => [line.kind, line.points.length])).toEqual([["trail", 3], ["trail", 2], ["trail", 2], ["boundary", 4]]);
    expect(data.skippedPoints).toBe(0);
  });

  it("accepts a bare geometry or feature and skips coordinates outside the supported range", () => {
    expect(parseGeoFile(JSON.stringify({ type: "LineString", coordinates: [[0, 0], [1, 1]] })).lines).toHaveLength(1);
    const data = parseGeoFile(JSON.stringify({ type: "Feature", geometry: { type: "LineString", coordinates: [[0, 89], [0, 10], ["x", 1], [1, 11]] } }));
    expect(data.lines[0]!.points).toEqual([{ lat: 10, lon: 0 }, { lat: 11, lon: 1 }]);
    expect(data.skippedPoints).toBe(2);
    expect(() => parseGeoFile("{ not json", "broken.geojson")).toThrow(/not valid JSON/);
  });
});

describe("fitting imported data to the project limits", () => {
  it("thins a long track under the per-path limit while keeping its endpoints", () => {
    const track = wiggle(50_000);
    const simplified = simplifyToLimit(track, MAX_CUSTOM_LINE_POINTS);
    expect(simplified.length).toBeLessThanOrEqual(MAX_CUSTOM_LINE_POINTS);
    expect(simplified.length).toBeGreaterThan(MAX_CUSTOM_LINE_POINTS / 4);
    expect(simplified[0]).toEqual(track[0]);
    expect(simplified.at(-1)).toEqual(track.at(-1));
    expect(simplifyToLimit(track.slice(0, 10), 100)).toHaveLength(10);
  });

  it("keeps the corners of a shape and drops the vertices between them", () => {
    const edge = (from: GeoPoint, to: GeoPoint) => Array.from({ length: 50 }, (_, step) => ({ lat: from.lat + (to.lat - from.lat) * step / 50, lon: from.lon + (to.lon - from.lon) * step / 50 }));
    const corners = [{ lat: 45, lon: -120 }, { lat: 45, lon: -119.9 }, { lat: 45.1, lon: -119.9 }, { lat: 45.1, lon: -120 }];
    const outline = [...edge(corners[0]!, corners[1]!), ...edge(corners[1]!, corners[2]!), ...edge(corners[2]!, corners[3]!), corners[3]!];
    expect(simplifyToLimit(outline, 4)).toEqual(corners);
  });

  it("shares the remaining point budget across paths and drops what has no room", () => {
    const data = { markers: wiggle(5), lines: [{ kind: "trail" as const, points: wiggle(30_000) }, { kind: "trail" as const, points: wiggle(10_000, 47) }, { kind: "boundary" as const, points: wiggle(40, 48) }], skippedPoints: 0 };
    const fitted = fitToCapacity(data, { markers: 3, lines: 250, points: 3_000 });
    const total = fitted.lines.reduce((sum, line) => sum + line.points.length, 0);
    expect(total).toBeLessThanOrEqual(3_000);
    expect(fitted.lines).toHaveLength(3);
    expect(fitted.lines[0]!.points.length).toBeGreaterThan(fitted.lines[1]!.points.length);
    expect(fitted.simplified).toBe(true);
    expect(fitted.markers).toHaveLength(3);
    expect(fitted.droppedMarkers).toBe(2);

    const cramped = fitToCapacity(data, { markers: 0, lines: 1, points: MAX_CUSTOM_DATA_POINTS });
    expect(cramped.lines).toHaveLength(1);
    expect(cramped.droppedLines).toBe(2);
    expect(fitToCapacity(data, { markers: 10, lines: 10, points: 3 }).lines).toHaveLength(1);
  });

  it("leaves small imports untouched", () => {
    const data = { markers: [], lines: [{ kind: "trail" as const, points: wiggle(20) }], skippedPoints: 0 };
    const fitted = fitToCapacity(data, { markers: 250, lines: 250, points: MAX_CUSTOM_DATA_POINTS });
    expect(fitted.lines[0]!.points).toHaveLength(20);
    expect(fitted.simplified).toBe(false);
  });

  it("counts features that miss the map area", () => {
    const bounds = { west: -121.1, east: -120.9, south: 45.9, north: 46.1 };
    expect(countOutside({ markers: [{ lat: 46, lon: -121 }, { lat: 50, lon: -121 }], lines: [{ kind: "trail", points: wiggle(10) }, { kind: "trail", points: wiggle(10, 60) }] }, bounds)).toBe(2);
  });
});
