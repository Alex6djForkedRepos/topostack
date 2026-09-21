import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT } from "@topostack/core";
import { markingColor, markingDash, markingStyleKey, markingWidth } from "$lib/studio/marking-style";

const style = DEFAULT_PROJECT.lineStyle;

describe("marking style", () => {
  it("classifies score operations before road classes and kinds", () => {
    expect(markingStyleKey({ operation: "score", kind: "road", transportationClass: "major-road" })).toBe("score");
    expect(markingStyleKey({ operation: "engrave", kind: "road", transportationClass: "local-road" })).toBe("local-road");
    expect(markingStyleKey({ operation: "engrave", kind: "boundary" })).toBe("boundary");
    expect(markingStyleKey({ operation: "engrave", kind: "label" as never })).toBe("engrave");
    expect(markingColor({ operation: "engrave", kind: "grid" })).toBe("#34404b");
  });

  it("uses the line style for widths and dashes", () => {
    expect(markingWidth({ kind: "trail", transportationClass: "trail" }, style)).toBe(style.trailMm);
    expect(markingWidth({ kind: "water" }, style)).toBe(style.waterMm);
    expect(markingDash({ kind: "road", transportationClass: "major-road" }, style)).toBeUndefined();
    expect(markingDash({ kind: "boundary" }, style)).toBe(`${Math.max(style.boundaryMm * 8, 1.6)} ${Math.max(style.boundaryMm * 5, 1)}`);
    expect(markingDash({ kind: "trail", transportationClass: "trail" }, { ...style, trailPattern: "solid" })).toBeUndefined();
    expect(markingDash({ kind: "trail", transportationClass: "trail" }, { ...style, trailPattern: "dotted" })).toBe(`0.01 ${Math.max(style.trailMm * 4, 0.7)}`);
  });
});
