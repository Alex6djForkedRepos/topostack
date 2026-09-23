// A lake-sized equirectangular frame in metres. It is an affine map of
// lon/lat, so a grid that is square in metres is also aligned to lon/lat, and a
// transform fitted in metres converts to lon/lat by composition. Distortion
// across one lake (tens of kilometres) is far below chart accuracy.

/** Mean Earth radius in metres. */
const EARTH_RADIUS_M = 6_371_008.8;
const METRES_PER_DEGREE = (Math.PI / 180) * EARTH_RADIUS_M;

export type Point2 = [number, number];

export interface LocalFrame {
  origin: Point2;
  /** Metres per degree of longitude and latitude at the origin. */
  scaleX: number;
  scaleY: number;
  toLocal(lon: number, lat: number): Point2;
  toLonLat(x: number, y: number): Point2;
}

export function localFrame(originLon: number, originLat: number): LocalFrame {
  const scaleX = METRES_PER_DEGREE * Math.cos((originLat * Math.PI) / 180);
  const scaleY = METRES_PER_DEGREE;
  return {
    origin: [originLon, originLat],
    scaleX,
    scaleY,
    toLocal: (lon, lat) => [(lon - originLon) * scaleX, (lat - originLat) * scaleY],
    toLonLat: (x, y) => [originLon + x / scaleX, originLat + y / scaleY],
  };
}

/** A frame centred on the bounding box of some lon/lat points. */
export function frameFor(points: readonly Point2[]): LocalFrame {
  if (!points.length) throw new Error("A local frame needs at least one point.");
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [lon, lat] of points) {
    west = Math.min(west, lon);
    east = Math.max(east, lon);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return localFrame((west + east) / 2, (south + north) / 2);
}
