// Pixel work for scanned charts: shrink, pick the ink, clean it, and thin it
// to one-pixel lines. Pure functions over plain arrays, so the batch build
// feeds them decoded files in Node and the studio feeds them ImageData in a
// worker.

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA bytes, row-major from the top-left. */
  data: Uint8Array | Uint8ClampedArray;
}

/** One byte per pixel; 1 is ink. */
export interface Mask {
  width: number;
  height: number;
  data: Uint8Array;
}

export type Rgb = [number, number, number];

/** Box-filters an image so its longer side is at most `maxSide`; returns the scale from new pixels to old. */
export function downsample(image: RgbaImage, maxSide: number): { image: RgbaImage; scale: number } {
  const scale = Math.max(1, Math.max(image.width, image.height) / maxSide);
  if (scale === 1) return { image, scale };
  const width = Math.max(1, Math.round(image.width / scale));
  const height = Math.max(1, Math.round(image.height / scale));
  const out = new Uint8Array(width * height * 4);
  const sx = image.width / width;
  const sy = image.height / height;
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const sum = [0, 0, 0, 0];
      for (let yy = y0; yy < y1; yy += 1) {
        for (let xx = x0; xx < x1; xx += 1) {
          const index = (yy * image.width + xx) * 4;
          for (let channel = 0; channel < 4; channel += 1) sum[channel]! += image.data[index + channel]!;
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      for (let channel = 0; channel < 4; channel += 1) out[(y * width + x) * 4 + channel] = Math.round(sum[channel]! / count);
    }
  }
  return { image: { width, height, data: out }, scale: image.width / width };
}

function luma(data: RgbaImage["data"], index: number): number {
  // Transparent pixels read as paper.
  const alpha = data[index + 3]! / 255;
  const value = 0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!;
  return value * alpha + 255 * (1 - alpha);
}

/** Otsu's threshold on a 256-bin histogram: the split that best separates ink from paper. */
export function otsu(histogram: ArrayLike<number>): number {
  let total = 0;
  let sum = 0;
  for (let value = 0; value < 256; value += 1) {
    total += histogram[value]!;
    sum += value * histogram[value]!;
  }
  let background = 0;
  let backgroundSum = 0;
  let best = 0;
  let threshold = 127;
  for (let value = 0; value < 256; value += 1) {
    background += histogram[value]!;
    if (!background) continue;
    const foreground = total - background;
    if (!foreground) break;
    backgroundSum += value * histogram[value]!;
    const meanBackground = backgroundSum / background;
    const meanForeground = (sum - backgroundSum) / foreground;
    const between = background * foreground * (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      threshold = value;
    }
  }
  return threshold;
}

/** Ink is anything darker than `threshold`, or than Otsu's split of the page when none is given. */
export function darkMask(image: RgbaImage, threshold?: number): Mask {
  const cells = image.width * image.height;
  const values = new Uint8Array(cells);
  const histogram = new Float64Array(256);
  for (let cell = 0; cell < cells; cell += 1) {
    const value = Math.round(luma(image.data, cell * 4));
    values[cell] = value;
    histogram[value] = histogram[value]! + 1;
  }
  const cut = threshold ?? otsu(histogram);
  const data = new Uint8Array(cells);
  for (let cell = 0; cell < cells; cell += 1) data[cell] = values[cell]! <= cut ? 1 : 0;
  return { width: image.width, height: image.height, data };
}

/** CIE L*a*b* for an sRGB colour, D65. */
export function lab([r, g, b]: Rgb): Rgb {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
  const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** Ink is anything within `tolerance` (CIE76 delta E) of one of the chosen colours. */
export function colourMask(image: RgbaImage, colours: readonly Rgb[], tolerance = 18): Mask {
  const targets = colours.map(lab);
  const cells = image.width * image.height;
  const data = new Uint8Array(cells);
  // Scans reuse few distinct colours; cache the answer per quantized colour.
  const cache = new Map<number, number>();
  for (let cell = 0; cell < cells; cell += 1) {
    const index = cell * 4;
    if (image.data[index + 3]! < 128) continue;
    const key = ((image.data[index]! >> 2) << 12) | ((image.data[index + 1]! >> 2) << 6) | (image.data[index + 2]! >> 2);
    let hit = cache.get(key);
    if (hit === undefined) {
      const [l, a, b] = lab([image.data[index]!, image.data[index + 1]!, image.data[index + 2]!]);
      hit = targets.some(([tl, ta, tb]) => Math.hypot(l - tl, a - ta, b - tb) <= tolerance) ? 1 : 0;
      cache.set(key, hit);
    }
    data[cell] = hit;
  }
  return { width: image.width, height: image.height, data };
}

export interface Swatch {
  colour: Rgb;
  /** Share of sampled pixels closest to this swatch. */
  share: number;
}

/**
 * The chart's main colours by k-means in L*a*b* over a deterministic sample
 * of pixels, most common first: the swatches a maker picks contour ink from.
 */
export function palette(image: RgbaImage, k = 8, samples = 20_000): Swatch[] {
  const cells = image.width * image.height;
  const stride = Math.max(1, Math.floor(cells / samples));
  const points: { rgb: Rgb; lab: Rgb }[] = [];
  for (let cell = 0; cell < cells; cell += stride) {
    const index = cell * 4;
    if (image.data[index + 3]! < 128) continue;
    const rgb: Rgb = [image.data[index]!, image.data[index + 1]!, image.data[index + 2]!];
    points.push({ rgb, lab: lab(rgb) });
  }
  if (!points.length) return [];
  // Farthest-point seeding keeps rare but distinct inks (a thin blue contour) as their own swatch.
  const centres: Rgb[] = [points[0]!.lab];
  const nearest = points.map((point) => Math.hypot(point.lab[0] - centres[0]![0], point.lab[1] - centres[0]![1], point.lab[2] - centres[0]![2]));
  while (centres.length < Math.min(k, points.length)) {
    let far = 0;
    for (let index = 1; index < points.length; index += 1) if (nearest[index]! > nearest[far]!) far = index;
    if (nearest[far] === 0) break;
    const centre = points[far]!.lab;
    centres.push(centre);
    points.forEach((point, index) => {
      nearest[index] = Math.min(nearest[index]!, Math.hypot(point.lab[0] - centre[0], point.lab[1] - centre[1], point.lab[2] - centre[2]));
    });
  }
  const assignment = new Int32Array(points.length);
  for (let iteration = 0; iteration < 12; iteration += 1) {
    points.forEach((point, index) => {
      let best = 0;
      let bestDistance = Infinity;
      centres.forEach((centre, which) => {
        const distance = (point.lab[0] - centre[0]) ** 2 + (point.lab[1] - centre[1]) ** 2 + (point.lab[2] - centre[2]) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = which;
        }
      });
      assignment[index] = best;
    });
    centres.forEach((_, which) => {
      let count = 0;
      const sum = [0, 0, 0];
      points.forEach((point, index) => {
        if (assignment[index] !== which) return;
        count += 1;
        for (let channel = 0; channel < 3; channel += 1) sum[channel]! += point.lab[channel]!;
      });
      if (count) centres[which] = [sum[0]! / count, sum[1]! / count, sum[2]! / count];
    });
  }
  // Report each swatch as the mean sRGB of its members.
  return centres.map((_, which) => {
    const sum = [0, 0, 0];
    let count = 0;
    points.forEach((point, index) => {
      if (assignment[index] !== which) return;
      count += 1;
      for (let channel = 0; channel < 3; channel += 1) sum[channel]! += point.rgb[channel]!;
    });
    return { colour: sum.map((value) => Math.round(value / Math.max(1, count))) as Rgb, share: count / points.length };
  }).filter((swatch) => swatch.share > 0).sort((a, b) => b.share - a.share);
}

export interface Component {
  pixels: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** 8-connected ink components: a label per pixel (-1 for paper) and each component's size and box. */
export function components(mask: Mask): { labels: Int32Array; components: Component[] } {
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height).fill(-1);
  const found: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < data.length; start += 1) {
    if (!data[start] || labels[start] !== -1) continue;
    const id = found.length;
    const component = { pixels: 0, left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    labels[start] = id;
    stack.push(start);
    while (stack.length) {
      const cell = stack.pop()!;
      const x = cell % width;
      const y = Math.floor(cell / width);
      component.pixels += 1;
      component.left = Math.min(component.left, x);
      component.right = Math.max(component.right, x);
      component.top = Math.min(component.top, y);
      component.bottom = Math.max(component.bottom, y);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (!data[next] || labels[next] !== -1) continue;
          labels[next] = id;
          stack.push(next);
        }
      }
    }
    found.push(component);
  }
  return { labels, components: found };
}

/** Drops ink components that cannot be lines: too few pixels, or a box smaller than `minSpan` both ways (specks, dots, most lone digits). */
export function removeSmall(mask: Mask, minPixels: number, minSpan = 0): Mask {
  const { labels, components: found } = components(mask);
  const keep = found.map((component) => component.pixels >= minPixels && Math.max(component.right - component.left, component.bottom - component.top) + 1 >= minSpan);
  const data = new Uint8Array(mask.data.length);
  for (let cell = 0; cell < data.length; cell += 1) if (labels[cell]! >= 0 && keep[labels[cell]!]) data[cell] = 1;
  return { ...mask, data };
}

/** Clears ink inside boxes (OCR'd labels, a legend) with a margin. */
export function eraseBoxes(mask: Mask, boxes: readonly { left: number; top: number; right: number; bottom: number }[], margin = 1): Mask {
  const data = new Uint8Array(mask.data);
  for (const box of boxes) {
    const left = Math.max(0, Math.floor(box.left - margin));
    const right = Math.min(mask.width - 1, Math.ceil(box.right + margin));
    const top = Math.max(0, Math.floor(box.top - margin));
    const bottom = Math.min(mask.height - 1, Math.ceil(box.bottom + margin));
    for (let y = top; y <= bottom; y += 1) data.fill(0, y * mask.width + left, y * mask.width + right + 1);
  }
  return { ...mask, data };
}

function morph(mask: Mask, radius: number, dilate: boolean): Mask {
  // Separable square structuring element: rows, then columns.
  const { width, height } = mask;
  const pass = (source: Uint8Array, horizontal: boolean) => {
    const out = new Uint8Array(source.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let value = dilate ? 0 : 1;
        for (let offset = -radius; offset <= radius; offset += 1) {
          const nx = horizontal ? x + offset : x;
          const ny = horizontal ? y : y + offset;
          const inside = nx >= 0 && ny >= 0 && nx < width && ny < height;
          const pixel = inside ? source[ny * width + nx]! : 0;
          if (dilate ? pixel : !pixel) {
            value = dilate ? 1 : 0;
            break;
          }
        }
        out[y * width + x] = value;
      }
    }
    return out;
  };
  return { width, height, data: pass(pass(mask.data, true), false) };
}

/** Morphological closing: bridges hairline breaks in scanned ink without thickening lines overall. */
export function close(mask: Mask, radius = 1): Mask {
  return radius > 0 ? morph(morph(mask, radius, true), radius, false) : mask;
}

/** Distance in pixels from each ink pixel to the nearest paper, by a two-pass 3-4 chamfer; paper is 0. */
export function inkDistance(mask: Mask): Float32Array {
  const { width, height, data } = mask;
  const distance = new Float32Array(width * height);
  for (let cell = 0; cell < distance.length; cell += 1) distance[cell] = data[cell] ? Infinity : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : distance[y * width + x]!);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = y * width + x;
      if (!distance[cell]) continue;
      distance[cell] = Math.min(distance[cell]!, at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const cell = y * width + x;
      if (!distance[cell]) continue;
      distance[cell] = Math.min(distance[cell]!, at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  }
  for (let cell = 0; cell < distance.length; cell += 1) distance[cell] = distance[cell]! / 3;
  return distance;
}

/**
 * Zhang-Suen thinning to one-pixel, 8-connected lines that keep the ink's
 * topology: a closed contour stays closed and a line stays one line.
 */
export function thin(mask: Mask): Mask {
  const { width, height } = mask;
  const data = new Uint8Array(mask.data);
  const pixel = (x: number, y: number) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : data[y * width + x]!);
  // Each sub-step rechecks only pixels bordering a removal since it last ran.
  const all: number[] = [];
  for (let cell = 0; cell < data.length; cell += 1) if (data[cell]) all.push(cell);
  const pending: Set<number>[] = [new Set(all), new Set(all)];
  const remove: number[] = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const step of [0, 1]) {
      remove.length = 0;
      const candidates = pending[step]!;
      pending[step] = new Set();
      for (const cell of candidates) {
        if (!data[cell]) continue;
        const x = cell % width;
        const y = Math.floor(cell / width);
        // Neighbours clockwise from north: p2..p9.
        const p = [pixel(x, y - 1), pixel(x + 1, y - 1), pixel(x + 1, y), pixel(x + 1, y + 1), pixel(x, y + 1), pixel(x - 1, y + 1), pixel(x - 1, y), pixel(x - 1, y - 1)];
        const count = p[0]! + p[1]! + p[2]! + p[3]! + p[4]! + p[5]! + p[6]! + p[7]!;
        if (count < 2 || count > 6) continue;
        let transitions = 0;
        for (let index = 0; index < 8; index += 1) if (!p[index] && p[(index + 1) % 8]) transitions += 1;
        if (transitions !== 1) continue;
        if (step === 0 ? p[0]! * p[2]! * p[4]! || p[2]! * p[4]! * p[6]! : p[0]! * p[2]! * p[6]! || p[0]! * p[4]! * p[6]!) continue;
        remove.push(cell);
      }
      if (!remove.length) continue;
      changed = true;
      for (const cell of remove) data[cell] = 0;
      for (const cell of remove) {
        const x = cell % width;
        const y = Math.floor(cell / width);
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height || !data[ny * width + nx]) continue;
            pending[0]!.add(ny * width + nx);
            pending[1]!.add(ny * width + nx);
          }
        }
      }
    }
  }
  return { width, height, data };
}
