import { describe, expect, it } from "vitest";
import { absolutePathCommands, flattenSvgPath } from "./svg-path-data.js";
import { signedArea } from "../primitives/geometry2d.js";

describe("SVG path data", () => {
  it("resolves relative, horizontal, and vertical commands to absolute lines", () => {
    expect(absolutePathCommands("m10 10 h5 v5 H10 z")).toEqual([
      ["M", 10, 10], ["L", 15, 10], ["L", 15, 15], ["L", 10, 15], ["Z"],
    ]);
  });

  it("treats extra pairs after a move as lines and reads compact numbers", () => {
    expect(absolutePathCommands("M0,0 10,0 10-10.5.5 1e1")).toEqual([["M", 0, 0], ["L", 10, 0], ["L", 10, -10.5], ["L", 0.5, 10]]);
  });

  it("reflects control points for S and T", () => {
    const [, , smooth] = absolutePathCommands("M0 0 C0 10 10 10 10 0 S20 -10 20 0");
    expect(smooth).toEqual(["C", 10, -10, 20, -10, 20, 0]);
    const [, , quadratic] = absolutePathCommands("M0 0 Q5 10 10 0 T20 0");
    expect(quadratic).toEqual(["Q", 15, -10, 20, 0]);
  });

  it("restarts at the closed point when drawing continues after Z", () => {
    expect(absolutePathCommands("M1 1 L5 1 L5 5 Z l2 0")).toEqual([
      ["M", 1, 1], ["L", 5, 1], ["L", 5, 5], ["Z"], ["M", 1, 1], ["L", 3, 1],
    ]);
  });

  it("draws arcs as cubics that land on the end point, with run-together flags", () => {
    const commands = absolutePathCommands("M0 0a10 10 0 1110 10");
    expect(commands.at(-1)!.slice(-2)).toEqual([10, 10]);
    expect(commands.slice(1).every(([type]) => type === "C")).toBe(true);
    // Large arc: three quarter turns become three segments.
    expect(commands.length).toBe(4);
  });

  it("flattens a circle drawn as two arcs to the expected area", () => {
    const [ring] = flattenSvgPath("M-10 0 A10 10 0 0 0 10 0 A10 10 0 0 0 -10 0 Z", 0.01);
    expect(ring!.closed).toBe(true);
    expect(Math.abs(signedArea(ring!.points))).toBeCloseTo(Math.PI * 100, 0);
  });

  it("stops at the first malformed token and keeps what came before", () => {
    expect(absolutePathCommands("M0 0 L10 0 L10 x L0 10")).toEqual([["M", 0, 0], ["L", 10, 0]]);
    expect(absolutePathCommands("M0 0 B4 4")).toEqual([["M", 0, 0]]);
  });

  it("keeps open subpaths open and separates subpaths", () => {
    const polylines = flattenSvgPath("M0 0 L10 0 M0 5 L10 5 L10 10 Z", 0.1);
    expect(polylines.map(({ closed }) => closed).sort()).toEqual([false, true]);
  });
});
