import { describe, expect, it } from "vitest";
import { contourInterval, renderPreview, type PreviewInput } from "$lib/site/lake-preview/render";
import { previewBounds } from "$lib/site/lake-preview/prepare";

/** A 100 × 60 grid of gently sloping land with a round lake (deepest 40 m) and a small, deep pond at the edge. */
function scene(options: { surveyed?: boolean } = {}): PreviewInput {
  const width = 100, height = 60, cells = width * height;
  const elevation = new Float32Array(cells), water = new Uint8Array(cells), depth = new Float32Array(cells).fill(NaN);
  const surveyed = new Uint8Array(cells), target = new Uint8Array(cells);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    elevation[i] = 300 + x * 0.5 + y * 0.2;
    const r = Math.hypot(x - 45, y - 30) / 20;
    if (r < 1) {
      water[i] = 1; target[i] = 1;
      depth[i] = 40 * (1 - r * r);
      elevation[i] = 300 - depth[i]!;
      surveyed[i] = options.surveyed === false ? 0 : 1;
    } else if (Math.hypot(x - 92, y - 8) < 4) {
      water[i] = 1;
      depth[i] = 90;
      elevation[i] = 210;
    }
  }
  return { width, height, elevation, water, depth, surveyed, target, groundWidthM: 10_000, groundHeightM: 6_000 };
}
const pixel = (image: ReturnType<typeof renderPreview>, x: number, y: number): number[] => {
  const i = (Math.round(y) * image.width + Math.round(x)) * 4;
  return [image.rgba[i]!, image.rgba[i + 1]!, image.rgba[i + 2]!];
};

describe("lake depth previews", () => {
  it("picks round contour intervals, about seven across the lake", () => {
    expect(contourInterval(593)).toBe(100);
    expect(contourInterval(40)).toBe(10);
    expect(contourInterval(12.2)).toBe(2);
    expect(contourInterval(3)).toBe(0.5);
    expect(contourInterval(0)).toBe(1);
  });

  it("frames the survey box with the studio link's 8% margin", () => {
    expect(previewBounds([10, 40, 11, 41])).toEqual({ west: 9.92, south: 39.92, east: 11.08, north: 41.08 });
  });

  it("keeps the ground's shape at 960 pixels on the long side", () => {
    const image = renderPreview(scene());
    expect([image.width, image.height]).toEqual([960, 576]);
    expect(image.rgba).toHaveLength(960 * 576 * 4);
    const portrait = renderPreview({ ...scene(), groundWidthM: 3_000, groundHeightM: 6_000 });
    expect([portrait.width, portrait.height]).toEqual([480, 960]);
  });

  it("scales depth to the previewed lake, not other water in the frame", () => {
    const image = renderPreview(scene());
    // The pond is 90 m deep, but only the target lake sets the maximum and the contours.
    expect(image.maxDepthM).toBeGreaterThan(38);
    expect(image.maxDepthM).toBeLessThanOrEqual(40);
    expect(image.contourIntervalM).toBe(10);
    expect(image.surveyedShare).toBe(1);
    const scale = image.width / 100;
    const centre = pixel(image, 45.5 * scale, 30.5 * scale);
    const edge = pixel(image, 45.5 * scale + 17 * scale, 30.5 * scale);
    const land = pixel(image, 5 * scale, 5 * scale);
    // Deeper water is darker; land is not blue.
    expect(centre[2]!).toBeLessThan(edge[2]! - 40);
    expect(land[2]!).toBeLessThan(land[0]!);
  });

  it("reports modelled depths and hatches them", () => {
    const modelled = renderPreview(scene({ surveyed: false }));
    const measured = renderPreview(scene());
    expect(modelled.surveyedShare).toBe(0);
    let lighter = 0;
    for (let i = 0; i < measured.rgba.length; i += 4) if (modelled.rgba[i]! > measured.rgba[i]! + 20) lighter++;
    // The hatch lightens about 2 in 9 lake pixels.
    expect(lighter).toBeGreaterThan(5_000);
  });
});
