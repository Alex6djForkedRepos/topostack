import { describe, expect, it } from "vitest";
import { parseGeoFile } from "$lib/domain/geo-import";

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="46.8523" lon="-121.7603"><name>Summit</name></wpt>
  <wpt lat="46.7867" lon="-121.7353"/>
  <rte><rtept lat="46.78" lon="-121.73"/><rtept lat="46.79" lon="-121.74"/></rte>
  <trk><name>Day 1</name>
    <trkseg><trkpt lat="46.78" lon="-121.73"><ele>1600</ele></trkpt><trkpt lat="46.781" lon="-121.731"/><trkpt lat="46.782" lon="-121.733"/></trkseg>
    <trkseg><trkpt lat="46.80" lon="-121.75"/><trkpt lat="46.80" lon="-121.75"/><trkpt lat="46.81" lon="-121.76"/></trkseg>
    <trkseg><trkpt lat="46.9" lon="-121.8"/></trkseg>
  </trk>
</gpx>`;

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <Placemark><Point><coordinates>-122.1,42.94,0</coordinates></Point></Placemark>
    <Placemark><LineString><coordinates>
      -122.10,42.90,0 -122.11,42.91,0
      -122.12,42.92,0
    </coordinates></LineString></Placemark>
    <Placemark><MultiGeometry>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>-122,42.8 -121.9,42.8 -121.9,42.9 -122,42.8</coordinates></LinearRing></outerBoundaryIs>
        <innerBoundaryIs><LinearRing><coordinates>-121.95,42.82 -121.94,42.83 -121.95,42.82</coordinates></LinearRing></innerBoundaryIs></Polygon>
    </MultiGeometry></Placemark>
    <Placemark><gx:Track><when>2026-01-01T00:00:00Z</when><gx:coord>-122.2 42.95 1900</gx:coord><gx:coord>-122.21 42.96 1910</gx:coord></gx:Track></Placemark>
  </Document>
</kml>`;

describe("XML geo import", () => {
  it("reads GPX waypoints, routes and every track segment", () => {
    const data = parseGeoFile(GPX, "hike.gpx");
    expect(data.markers).toEqual([{ lat: 46.8523, lon: -121.7603 }, { lat: 46.7867, lon: -121.7353 }]);
    expect(data.lines.map((line) => line.points.length)).toEqual([3, 2, 2]);
    expect(data.lines.every((line) => line.kind === "trail")).toBe(true);
  });

  it("reads KML points, line strings, polygon outlines and Google Earth tracks", () => {
    const data = parseGeoFile(KML, "park.kml");
    expect(data.markers).toEqual([{ lat: 42.94, lon: -122.1 }]);
    expect(data.lines.map((line) => [line.kind, line.points.length])).toEqual([["trail", 3], ["boundary", 4], ["trail", 2]]);
    expect(data.lines[0]!.points[0]).toEqual({ lat: 42.9, lon: -122.1 });
  });

  it("reports malformed XML", () => {
    expect(() => parseGeoFile("<gpx><trk>", "broken.gpx")).toThrow(/not valid XML/);
    expect(parseGeoFile("<gpx version=\"1.1\"></gpx>", "empty.gpx")).toEqual({ markers: [], lines: [], skippedPoints: 0 });
  });
});
