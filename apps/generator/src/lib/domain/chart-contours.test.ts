import { describe, expect, it } from "vitest";
import { detectChartContours, nearestChartContour } from "$lib/domain/chart-contours";

describe("contour selection", () => {
  it("hits the nearest segment, including a closing edge, and ignores distant ink", () => {
    const lines = [{ points: [[0, 0], [100, 0], [100, 100]] as [number, number][], closed: true }];
    expect(nearestChartContour(lines, 50, 3, 12)).toEqual({ index: 0, x: 50, y: 0 });
    expect(nearestChartContour(lines, 48, 52, 12)).toEqual({ index: 0, x: 50, y: 50 });
    expect(nearestChartContour(lines, 10, 80, 12)).toBeUndefined();
    expect(nearestChartContour([...lines, { points: [[0, 6], [100, 6]], closed: false }], 50, 5, 12)?.index).toBe(1);
  });
  it("finds joined rings before any depth has been assigned", () => {
    const width = 160, height = 160;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const radius = Math.hypot(x - 80, y - 80);
      if ([30, 60].some(r => Math.abs(radius - r) < 1.2)) {
        const offset = (y * width + x) * 4;
        data[offset] = data[offset + 1] = data[offset + 2] = 10;
      }
    }
    const lines = detectChartContours({ width, height, data });
    expect(lines.length).toBe(2);
    expect(nearestChartContour(lines, 140, 80, 12)).toBeDefined();
    expect(nearestChartContour(lines, 110, 80, 12)?.index).not.toBe(nearestChartContour(lines, 140, 80, 12)?.index);
  });
});
