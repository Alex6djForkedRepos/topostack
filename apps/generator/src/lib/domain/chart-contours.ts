import { traceRasterChart } from "@topostack/chart-trace/trace-raster";
import type { Point2 } from "@topostack/chart-trace/local-frame";
import type { ChartImage } from "$lib/domain/chart-build";

export interface ChartContour { points: Point2[]; closed: boolean }

/** Same joined geometry and defaults as the final image trace, before assigning levels. */
export function detectChartContours(image: ChartImage): ChartContour[] {
  return traceRasterChart(image, { labels: "depth", geometryOnly: true }).selectionContours;
}

/** Project onto segments, rather than vertices, so long simplified edges stay selectable. */
export function nearestChartContour(lines: readonly ChartContour[], x: number, y: number, reach: number): { index: number; x: number; y: number } | undefined {
  let best = reach * reach;
  let found: { index: number; x: number; y: number } | undefined;
  lines.forEach((line, index) => {
    const n = line.points.length;
    for (let i = 0; i < n - 1 + Number(line.closed); i++) {
      const a = line.points[i % n]!, b = line.points[(i + 1) % n]!;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / length)) : 0;
      const px = a[0] + t * dx, py = a[1] + t * dy;
      const distance = (x - px) ** 2 + (y - py) ** 2;
      if (distance < best) { best = distance; found = { index, x: px, y: py }; }
    }
  });
  return found;
}
