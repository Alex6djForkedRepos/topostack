import { describe, expect, it } from "vitest";
import { blank, ellipse, stamp, stroke } from "./fixtures/synthetic-scan.ts";
import { close, colourMask, components, darkMask, downsample, eraseBoxes, inkDistance, lab, otsu, palette, removeSmall, thin, type Mask } from "./raster.ts";

const count = (mask: Mask) => mask.data.reduce((sum, value) => sum + value, 0);

describe("downsample", () => {
  it("box-filters to the longest side and reports the scale", () => {
    const image = blank(8, 4);
    for (let x = 0; x < 8; x += 2) image.data.set([0, 0, 0, 255], x * 4);
    const { image: small, scale } = downsample(image, 4);
    expect(scale).toBe(2);
    expect([small.width, small.height]).toEqual([4, 2]);
    // Each 2x2 block holds one black pixel of four.
    expect(small.data[0]).toBe(191);
    expect(downsample(image, 100)).toMatchObject({ scale: 1, image });
  });
});

describe("ink masks", () => {
  it("splits ink from paper with Otsu's threshold", () => {
    const histogram = new Array(256).fill(0);
    histogram[20] = 100;
    histogram[230] = 900;
    expect(otsu(histogram)).toBeGreaterThanOrEqual(20);
    expect(otsu(histogram)).toBeLessThan(230);
    const image = blank(20, 10);
    stroke(image, [[2, 5], [17, 5]], false, 2);
    const mask = darkMask(image);
    expect(count(mask)).toBeGreaterThan(20);
    expect(mask.data[5 * 20 + 10]).toBe(1);
    expect(mask.data[0]).toBe(0);
    expect(count(darkMask(image, 0))).toBe(count(mask));
  });

  it("picks a chosen colour and leaves other ink alone", () => {
    const image = blank(20, 10);
    stroke(image, [[2, 3], [17, 3]], false, 2, [30, 60, 200]);
    stroke(image, [[2, 7], [17, 7]], false, 2, [0, 0, 0]);
    const mask = colourMask(image, [[40, 70, 190]]);
    expect(mask.data[3 * 20 + 10]).toBe(1);
    expect(mask.data[7 * 20 + 10]).toBe(0);
    expect(lab([255, 255, 255])[0]).toBeCloseTo(100, 0);
  });

  it("finds the chart's inks as swatches, most common first", () => {
    const image = blank(60, 60);
    for (let y = 0; y < 60; y += 6) stroke(image, [[0, y], [59, y]], false, 2, [20, 80, 200]);
    stamp(image, 30, 30, 6, [200, 30, 30]);
    const swatches = palette(image, 3);
    expect(swatches[0]!.colour).toEqual([255, 255, 255]);
    expect(swatches.map((swatch) => swatch.colour)).toContainEqual([20, 80, 200]);
    expect(swatches.reduce((sum, swatch) => sum + swatch.share, 0)).toBeCloseTo(1, 6);
    expect(palette({ width: 0, height: 0, data: new Uint8Array() })).toEqual([]);
  });
});

describe("mask cleanup", () => {
  const mask = (width: number, height: number, ink: [number, number][]): Mask => {
    const data = new Uint8Array(width * height);
    for (const [x, y] of ink) data[y * width + x] = 1;
    return { width, height, data };
  };

  it("labels 8-connected components and drops specks and short marks", () => {
    const line = Array.from({ length: 12 }, (_, x): [number, number] => [x, 1]);
    const speck: [number, number][] = [[5, 5], [6, 6]];
    const tick: [number, number][] = [[10, 4], [10, 5], [10, 6]];
    const input = mask(14, 8, [...line, ...speck, ...tick]);
    const { components: found } = components(input);
    expect(found.map((component) => component.pixels).sort((a, b) => a - b)).toEqual([2, 3, 12]);
    expect(count(removeSmall(input, 3))).toBe(15);
    expect(count(removeSmall(input, 1, 5))).toBe(12);
  });

  it("erases boxes with a margin and closes hairline breaks", () => {
    const line = Array.from({ length: 12 }, (_, x): [number, number] => [x, 3]).filter(([x]) => x !== 6);
    const input = mask(12, 7, line);
    expect(components(close(input)).components).toHaveLength(1);
    expect(components(input).components).toHaveLength(2);
    expect(count(eraseBoxes(input, [{ left: 0, top: 3, right: 2, bottom: 3 }], 1))).toBe(line.length - 4);
  });
});

describe("inkDistance and thin", () => {
  it("measures stroke half-width and thins to a one-pixel line of the same reach", () => {
    const image = blank(60, 20);
    stroke(image, [[5, 10], [55, 10]], false, 7);
    const ink = darkMask(image);
    const distance = inkDistance(ink);
    expect(distance[10 * 60 + 30]!).toBeGreaterThan(3);
    expect(distance[10 * 60 + 30]!).toBeLessThan(5);
    expect(distance[0]).toBe(0);
    const skeleton = thin(ink);
    // One pixel thick: no column holds two skeleton pixels in the middle.
    for (let x = 15; x < 45; x += 1) {
      let column = 0;
      for (let y = 0; y < 20; y += 1) column += skeleton.data[y * 60 + x]!;
      expect(column).toBe(1);
    }
    expect(count(skeleton)).toBeGreaterThan(40);
  });

  it("keeps a ring a ring", () => {
    const image = blank(80, 80);
    stroke(image, ellipse(40, 40, 25, 18), true, 5);
    const skeleton = thin(darkMask(image));
    expect(components(skeleton).components).toHaveLength(1);
    // About the ring's perimeter, not a smear or a broken arc.
    expect(count(skeleton)).toBeGreaterThan(120);
    expect(count(skeleton)).toBeLessThan(190);
  });
});
