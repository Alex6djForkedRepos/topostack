/**
 * Draws the top-down depth map shown on a lake's page: shaded terrain around
 * the lake, lake floors tinted by depth with depth contours, and a hatch over
 * depths the studio models rather than measures. Pure: grids in, RGBA out, so
 * it runs in Node and in tests without a canvas.
 */
export interface PreviewInput {
  /** Grid columns and rows; samples run edge to edge, north row first. */
  width: number;
  height: number;
  /** Terrain with lake beds carved in, metres. */
  elevation: Float32Array;
  /** 1 where the cell is lake water. */
  water: Uint8Array;
  /** Metres below the lake surface for water cells, NaN elsewhere. */
  depth: Float32Array;
  /** 1 where the depth comes from a survey rather than the model. */
  surveyed: Uint8Array;
  /** 1 for the previewed lake's cells; the depth scale and statistics come from these. Empty means all water. */
  target: Uint8Array;
  /** Ground size of the whole grid, metres. */
  groundWidthM: number;
  groundHeightM: number;
}
export interface PreviewImage {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  /** The previewed lake's depth at the 99.5th percentile: its deepest water, ignoring isolated spikes. */
  maxDepthM: number;
  contourIntervalM: number;
  /** Share of the previewed lake's cells with surveyed depths, 0–1. */
  surveyedShare: number;
}

const LONG_SIDE = 960;
const SHALLOW = [205, 232, 240];
const MIDDLE = [88, 160, 200];
const DEEP = [22, 62, 105];
const LAND_LOW = [226, 221, 204];
const LAND_HIGH = [176, 164, 146];
const SEA = [200, 222, 234];
const CONTOUR = [14, 44, 72];
const SHORE = [36, 70, 98];
/** Hillshade light from the north-west (315°), 45° up, the cartographic default; Horn's formula takes it as 360 − 315 + 90 = 135°. */
const AZIMUTH = 135 * Math.PI / 180;
const ALTITUDE = 45 * Math.PI / 180;

const mix = (a: number[], b: number[], t: number): number[] => a.map((value, i) => value + (b[i]! - value) * t);
function ramp(t: number): number[] {
  return t < 0.5 ? mix(SHALLOW, MIDDLE, t * 2) : mix(MIDDLE, DEEP, (t - 0.5) * 2);
}
/** 1, 2 or 5 × 10ⁿ metres, giving about seven contours across the deepest lake. */
export function contourInterval(maxDepthM: number): number {
  if (!(maxDepthM > 0)) return 1;
  const target = maxDepthM / 7;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((step) => step * magnitude).find((value) => value >= target) ?? magnitude * 10;
}

/**
 * Horn's slope and aspect on the grid, returned as 0–1 illumination. Relief is
 * exaggerated where the land is gentle, so a flat lake district still reads.
 */
function hillshade(input: PreviewInput): Float32Array {
  const { width, height, elevation } = input;
  const cellX = input.groundWidthM / Math.max(1, width - 1);
  const cellY = input.groundHeightM / Math.max(1, height - 1);
  let min = Infinity;
  let max = -Infinity;
  for (const value of elevation) { if (value < min) min = value; if (value > max) max = value; }
  const relief = Math.max(1, max - min);
  const zFactor = Math.min(6, Math.max(1.5, input.groundWidthM / relief / 60));
  const at = (x: number, y: number): number => elevation[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))]!;
  const shade = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dzdx = ((at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))) / (8 * cellX);
    const dzdy = ((at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))) / (8 * cellY);
    const slope = Math.atan(zFactor * Math.hypot(dzdx, dzdy));
    const aspect = Math.atan2(dzdy, -dzdx);
    const lit = Math.sin(ALTITUDE) * Math.cos(slope) + Math.cos(ALTITUDE) * Math.sin(slope) * Math.cos(AZIMUTH - aspect);
    shade[y * width + x] = Math.max(0, Math.min(1, lit));
  }
  return shade;
}

export function renderPreview(input: PreviewInput): PreviewImage {
  const { width, height } = input;
  const landscape = input.groundWidthM >= input.groundHeightM;
  const outWidth = landscape ? LONG_SIDE : Math.max(1, Math.round(LONG_SIDE * input.groundWidthM / input.groundHeightM));
  const outHeight = landscape ? Math.max(1, Math.round(LONG_SIDE * input.groundHeightM / input.groundWidthM)) : LONG_SIDE;
  const shade = hillshade(input);

  let landMin = Infinity;
  let landMax = -Infinity;
  let waterCells = 0;
  let surveyedCells = 0;
  const depths: number[] = [];
  const hasTarget = input.target.some((value) => value === 1);
  for (let i = 0; i < width * height; i++) {
    if (input.water[i]) {
      if (hasTarget && !input.target[i]) continue;
      waterCells++;
      if (input.surveyed[i]) surveyedCells++;
      if (Number.isFinite(input.depth[i])) depths.push(input.depth[i]!);
    } else if (input.elevation[i]! > 0) {
      landMin = Math.min(landMin, input.elevation[i]!);
      landMax = Math.max(landMax, input.elevation[i]!);
    }
  }
  const landSpan = Math.max(1, landMax - landMin);
  depths.sort((a, b) => a - b);
  const maxDepthM = depths.length ? depths[Math.min(depths.length - 1, Math.floor(depths.length * 0.995))]! : 0;
  const interval = contourInterval(maxDepthM);

  // Bilinear for continuous values, nearest cell for masks.
  const sample = (values: Float32Array, gx: number, gy: number): number => {
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
    const fx = gx - x0, fy = gy - y0;
    const a = values[y0 * width + x0]!, b = values[y0 * width + x1]!, c = values[y1 * width + x0]!, d = values[y1 * width + x1]!;
    if (![a, b, c, d].every(Number.isFinite)) {
      const nearest = values[Math.round(gy) * width + Math.round(gx)]!;
      return Number.isFinite(nearest) ? nearest : [a, b, c, d].find(Number.isFinite) ?? NaN;
    }
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  const cellOf = (gx: number, gy: number): number => Math.min(height - 1, Math.round(gy)) * width + Math.min(width - 1, Math.round(gx));

  // First pass: the depth band of every output pixel, for contours and the shoreline.
  const band = new Int32Array(outWidth * outHeight).fill(-1);
  const gridX = (px: number): number => Math.min(width - 1, Math.max(0, (px + 0.5) * (width - 1) / outWidth));
  const gridY = (py: number): number => Math.min(height - 1, Math.max(0, (py + 0.5) * (height - 1) / outHeight));
  const depthAt = new Float32Array(outWidth * outHeight).fill(NaN);
  for (let py = 0; py < outHeight; py++) for (let px = 0; px < outWidth; px++) {
    const gx = gridX(px), gy = gridY(py);
    if (!input.water[cellOf(gx, gy)]) continue;
    const depth = Math.max(0, sample(input.depth, gx, gy));
    depthAt[py * outWidth + px] = depth;
    band[py * outWidth + px] = Math.floor(depth / interval);
  }

  const rgba = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let py = 0; py < outHeight; py++) for (let px = 0; px < outWidth; px++) {
    const index = py * outWidth + px;
    const gx = gridX(px), gy = gridY(py);
    const lit = sample(shade, gx, gy);
    let color: number[];
    if (band[index]! >= 0) {
      const depth = depthAt[index]!;
      // Other lakes share the previewed lake's scale; deeper water stops at the darkest blue.
      color = ramp(Math.sqrt(Math.min(1, depth / Math.max(0.5, maxDepthM))));
      color = color.map((value) => value * (0.86 + 0.14 * lit));
      if (!input.surveyed[cellOf(gx, gy)] && (px + py) % 9 < 2) color = mix(color, [255, 255, 255], 0.35);
      const right = px + 1 < outWidth ? band[index + 1]! : band[index]!;
      const below = py + 1 < outHeight ? band[index + outWidth]! : band[index]!;
      if (right < 0 || below < 0 || (px > 0 && band[index - 1]! < 0) || (py > 0 && band[index - outWidth]! < 0)) color = mix(color, SHORE, 0.75);
      else if (right !== band[index] || below !== band[index]) color = mix(color, CONTOUR, 0.55);
    } else {
      const elevation = sample(input.elevation, gx, gy);
      if (elevation <= 0 && landMin > 0) color = SEA.map((value) => value * (0.92 + 0.08 * lit));
      else {
        const t = Math.max(0, Math.min(1, (elevation - landMin) / landSpan));
        color = mix(LAND_LOW, LAND_HIGH, Math.sqrt(t)).map((value) => value * (0.5 + 0.55 * lit));
      }
    }
    rgba[index * 4] = color[0]!;
    rgba[index * 4 + 1] = color[1]!;
    rgba[index * 4 + 2] = color[2]!;
    rgba[index * 4 + 3] = 255;
  }
  return { width: outWidth, height: outHeight, rgba, maxDepthM, contourIntervalM: interval, surveyedShare: waterCells ? surveyedCells / waterCells : 0 };
}
