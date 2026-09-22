// A synthetic scanned chart: nested rings inked into an RGBA image, an
// optional bold shore, and "labels" whose glyphs a fake OCR engine can read.
// Each glyph is an L (a bar with a foot), so its crop reads differently the
// right way up and upside down, and the glyph count stands for the value.

import type { Point2 } from "../local-frame.ts";
import type { RgbaImage, Rgb } from "../raster.ts";
import type { Recognizer } from "../raster-labels.ts";

export function blank(width: number, height: number): RgbaImage {
  return { width, height, data: new Uint8Array(width * height * 4).fill(255) };
}

export function stamp(image: RgbaImage, x: number, y: number, radius: number, colour: Rgb = [0, 0, 0]): void {
  for (let dy = -Math.ceil(radius); dy <= Math.ceil(radius); dy += 1) {
    for (let dx = -Math.ceil(radius); dx <= Math.ceil(radius); dx += 1) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const px = Math.round(x + dx);
      const py = Math.round(y + dy);
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
      const index = (py * image.width + px) * 4;
      image.data[index] = colour[0];
      image.data[index + 1] = colour[1];
      image.data[index + 2] = colour[2];
    }
  }
}

export function stroke(image: RgbaImage, points: readonly Point2[], closed: boolean, width: number, colour?: Rgb): void {
  const ring = closed ? [...points, points[0]!] : points;
  for (let index = 1; index < ring.length; index += 1) {
    const [x1, y1] = ring[index - 1]!;
    const [x2, y2] = ring[index]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2));
    for (let step = 0; step <= steps; step += 1) stamp(image, x1 + ((x2 - x1) * step) / steps, y1 + ((y2 - y1) * step) / steps, width / 2, colour);
  }
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, count = 180): Point2[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (2 * Math.PI * index) / count;
    return [cx + rx * Math.cos(angle) * (1 + 0.1 * Math.sin(3 * angle)), cy + ry * Math.sin(angle) * (1 + 0.1 * Math.sin(3 * angle))];
  });
}

/** Draws `count` L-glyphs reading along `angle` centred on (x, y), after clearing a gap in the line under them. */
export function label(image: RgbaImage, x: number, y: number, angle: number, count: number, glyph = 12): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const along = (u: number, v: number): Point2 => [x + u * cos - v * sin, y + u * sin + v * cos];
  const span = count * glyph * 0.8;
  // Paper under the label, as charts leave a gap in the contour.
  for (let u = -span / 2 - 3; u <= span / 2 + 3; u += 0.5) for (let v = -glyph * 0.7; v <= glyph * 0.7; v += 0.5) stamp(image, ...along(u, v), 0.6, [255, 255, 255]);
  for (let index = 0; index < count; index += 1) {
    const u0 = -span / 2 + index * glyph * 0.8 + glyph * 0.15;
    // The bar, then the foot to the right at the bottom (y down).
    stroke(image, [along(u0, -glyph / 2), along(u0, glyph / 2)], false, 2);
    stroke(image, [along(u0, glyph / 2), along(u0 + glyph * 0.45, glyph / 2)], false, 2);
  }
}

/**
 * Reads the synthetic glyphs: counts the bars (dark columns) and accepts the
 * crop only the right way up, where each bar's foot runs right from its
 * bottom. Line stubs either side of a label cross the middle, so orientation
 * is judged at the bars alone.
 */
export function fakeRecognizer(values: Record<number, string>): Recognizer & { calls: number } {
  const recognize = (async (crop: RgbaImage) => {
    recognize.calls += 1;
    const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < crop.width && y < crop.height && crop.data[(y * crop.width + x) * 4]! < 128;
    // A bar is a run of columns inked over at least a third of the crop's height.
    const columns = Array.from({ length: crop.width }, (_, x) => {
      let run = 0;
      for (let y = 0; y < crop.height; y += 1) run += dark(x, y) ? 1 : 0;
      return run >= crop.height / 3;
    });
    const bars: [number, number][] = [];
    for (let x = 0; x < crop.width; x += 1) {
      if (!columns[x]) continue;
      if (!columns[x - 1]) bars.push([x, x]);
      bars.at(-1)![1] = x;
    }
    let right = 0;
    let wrong = 0;
    for (const [first, last] of bars) {
      let top = crop.height;
      let bottom = 0;
      for (let y = 0; y < crop.height; y += 1) {
        for (let x = first; x <= last; x += 1) {
          if (!dark(x, y)) continue;
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
      // Ink in a small band beside the bar's end: right of its bottom when upright, left of its top when not.
      const reach = Math.round((bottom - top) * 0.35);
      const band = Math.max(2, Math.round((bottom - top) * 0.2));
      const inked = (x0: number, x1: number, y0: number, y1: number) => {
        for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if (dark(x, y)) return true;
        return false;
      };
      if (inked(last + 2, last + reach, bottom - band, bottom)) right += 1;
      if (inked(first - reach, first - 2, top, top + band)) wrong += 1;
    }
    const upright = bars.length > 0 && right > wrong;
    return { text: upright ? values[bars.length] ?? "?" : "?", confidence: upright ? 90 : 20 };
  }) as Recognizer & { calls: number };
  recognize.calls = 0;
  return recognize;
}
