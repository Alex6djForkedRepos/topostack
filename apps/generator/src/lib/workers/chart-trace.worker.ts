import { buildChartFromImage, type ChartBuildRequest } from "$lib/domain/chart-build";
import { palette, type Swatch } from "@topostack/chart-trace/raster";

/**
 * Tracing a chart runs off the main thread: thinning and gridding a scan take
 * seconds on a large image, and the studio must stay responsive while the
 * maker watches the preview.
 */

interface PaletteRequest { id: number; kind: "palette"; image: ChartBuildRequest["image"]; count?: number }
interface BuildRequest { id: number; kind: "build"; request: ChartBuildRequest }
export type ChartWorkerRequest = PaletteRequest | BuildRequest;

self.onmessage = (event: MessageEvent<ChartWorkerRequest>) => {
  const message = event.data;
  try {
    if (message.kind === "palette") {
      const swatches: Swatch[] = palette(message.image, message.count ?? 8);
      self.postMessage({ id: message.id, swatches });
      return;
    }
    self.postMessage({ id: message.id, built: buildChartFromImage(message.request) });
  } catch (error) {
    self.postMessage({ id: message.id, error: error instanceof Error ? error.message : String(error) });
  }
};

self.postMessage({ ready: true });
