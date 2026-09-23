import polygonClipping from "polygon-clipping";
import { DEFAULT_PROJECT, type GeometryIRV1, type Polygon2D } from "@topostack/core";
import { contours } from "d3-contour";
import { decodeChartDepths, type ChartGridV1 } from "@topostack/data-contracts/chart-bathymetry";
import { chartFrame } from "./chart-surface";

/** Preview only: bound contour extraction and preserve holes even when reducing
 * resolution. Each polygon is material shallower than the slab's lower edge,
 * so deeper water cuts holes through upper sheets, not raised islands. */
export function chartStackLayers(grid: ChartGridV1, intervalM: number) {
  const depths = decodeChartDepths(grid);
  const stride = Math.max(1, Math.ceil(Math.max(grid.width, grid.height) / 192));
  const width = Math.ceil(grid.width / stride), height = Math.ceil(grid.height / stride);
  const values = new Array<number>(width * height);
  let deepest = 0;
  for (const depth of depths) if (Number.isFinite(depth)) deepest = Math.max(deepest, depth);
  const requested = Number.isFinite(intervalM) && intervalM > 0 ? intervalM : Math.max(deepest / 10, 1);
  const stepM = requested * Math.max(1, Math.ceil(deepest / requested / 64));
  const layerCount = Math.max(1, Math.ceil(deepest / stepM));
  for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
    let sum = 0, count = 0, missing = false;
    for (let y = row * stride; y < Math.min((row + 1) * stride, grid.height); y++)
      for (let x = col * stride; x < Math.min((col + 1) * stride, grid.width); x++) {
        const depth = depths[y * grid.width + x]!;
        if (!Number.isFinite(depth)) missing = true;
        else { sum += depth; count++; }
      }
    values[row * width + col] = missing || !count ? Number.NaN : -sum / count;
  }
  const { spanX, spanZ, scale } = chartFrame(grid);
  const extract = contours().size([width, height]);
  const layers = Array.from({ length: layerCount }, (_, index) => ({
    top: -index * stepM * scale,
    thickness: stepM * scale,
    // Shapes use X/Y before extrusion; rotating +90° puts depth down and
    // image rows toward +Z, retaining north at the back of the preview.
    polygons: extract.contour(values, -(index + 1) * stepM).coordinates.map(polygon =>
      polygon.map(ring => ring.map(([x, y]) => [
        (x! / width - 0.5) * spanX * scale,
        (y! / height - 0.5) * spanZ * scale,
      ] as [number, number]))),
  }));
  return { layers, stepM, totalDepth: layerCount * stepM * scale, simplified: stride > 1 || stepM !== requested };
}

/** A self-contained 300 mm-class model with twelve 3 mm sheets. The surround
 * and backing are illustrative stock, never inferred terrain or project data. */
export function representativeChartGeometry(grid: ChartGridV1): Pick<GeometryIRV1, "widthMm" | "heightMm" | "layers" | "waterSurfaces" | "lineStyle"> {
  let deepest = 0;
  for (const value of decodeChartDepths(grid)) if (Number.isFinite(value)) deepest = Math.max(deepest, value);
  const stack = chartStackLayers(grid, deepest > 0 ? deepest / 11 * (1 + 1e-12) : 1);
  const { spanX, spanZ, scale } = chartFrame(grid);
  const widthMm = spanX * scale * 140 + 20, heightMm = spanZ * scale * 140 + 20;
  const frame: [number, number][] = [
    [-widthMm / 2, -heightMm / 2], [widthMm / 2, -heightMm / 2],
    [widthMm / 2, heightMm / 2], [-widthMm / 2, heightMm / 2],
    [-widthMm / 2, -heightMm / 2],
  ];
  const toStock = (polygons: [number, number][][][]) => polygons.map(polygon =>
    polygon.map(ring => ring.map(([x, y]) => [x * 140, y * 140] as [number, number])));
  const footprint = toStock(stack.layers.at(-1)!.polygons);
  const surround = footprint.length ? polygonClipping.difference([[frame]], footprint) : [[frame]];
  const sheets = deepest > 0 ? stack.layers.slice().reverse() : Array.from({ length: 11 }, () => stack.layers[0]!);
  const shapes = [[[frame]], ...sheets.map(layer => {
    const shallow = toStock(layer.polygons);
    return shallow.length ? polygonClipping.union(surround, shallow) : surround;
  })];
  const asPolygon = (rings: [number, number][][]): Polygon2D => ({
    outer: rings[0]!.map(([x, y]) => ({ x, y })),
    holes: rings.slice(1).map(ring => ring.map(([x, y]) => ({ x, y }))),
  });
  return {
    widthMm, heightMm, lineStyle: DEFAULT_PROJECT.lineStyle, waterSurfaces: [],
    layers: shapes.map((polygons, index) => ({
      id: `chart-preview-${index}`, index, elevationM: 0, materialThicknessMm: 3,
      polygons: polygons.map(asPolygon), markings: [], pieces: [],
    })),
  };
}
