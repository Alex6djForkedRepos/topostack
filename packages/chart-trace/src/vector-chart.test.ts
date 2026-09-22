import { describe, expect, it } from "vitest";
import type { Point2 } from "./local-frame.ts";
import { bridgeGaps, chainPaths, depthLabels, labelChains, parseLabel, strokeStyles, styleKey, type Chain } from "./vector-chart.ts";
import type { VectorPath } from "./vector-page.ts";

const path = (points: Point2[], stroke = "#9c9c9c", extra: Partial<VectorPath> = {}): VectorPath => ({ stroke, lineWidth: 0.48, dashed: false, points, closed: false, ...extra });

describe("strokeStyles", () => {
  it("ranks stroke styles by drawn length and ignores fills and dots", () => {
    const styles = strokeStyles({
      width: 100, height: 100, texts: [],
      paths: [
        path([[0, 0], [10, 0]]), path([[0, 5], [30, 5]]),
        path([[0, 0], [10, 0], [10, 10]], "#000000", { lineWidth: 0.72, dashed: true, closed: true }),
        { fill: "#bee8ff", lineWidth: 1, dashed: false, points: [[0, 0], [5, 5]], closed: false },
        path([[3, 3]]),
      ],
    });
    expect(styles.map((style) => [style.key, style.paths, Math.round(style.length)])).toEqual([
      ["#9c9c9c/0.48", 2, 40],
      ["#000000/0.72/dashed", 1, 34],
    ]);
    expect(styleKey({ lineWidth: 1, dashed: false })).toBe("none/1.00");
  });
});

describe("labels", () => {
  it("reads depth and elevation labels with common unit marks and ignores other text", () => {
    expect(["15", "10'", "2.5 m", "320 ft", "7′"].map(parseLabel)).toEqual([15, 10, 2.5, 320, 7]);
    expect(["Figure 6", "1,200,000", "-5", "", "12345"].map(parseLabel)).toEqual([undefined, undefined, undefined, undefined, undefined]);
    const texts = [
      { text: "15", x: 10, y: 10, angle: 0, size: 9, width: 12 },
      { text: "20", x: 500, y: 10, angle: 0, size: 9, width: 12 },
      { text: "Legend", x: 10, y: 10, angle: 0, size: 9, width: 30 },
    ];
    expect(depthLabels(texts).map((label) => label.value)).toEqual([15, 20]);
    expect(depthLabels(texts, (x) => x < 100).map((label) => label.value)).toEqual([15]);
  });
});

describe("chainPaths", () => {
  it("joins pieces end to end in either direction and closes loops", () => {
    const chains = chainPaths([
      path([[10, 0], [20, 0]]),
      path([[0, 0], [10, 0.1]]),
      path([[30, 0], [20, 0]]),
      path([[0, 50], [10, 50], [10, 60]]),
      path([[10, 60], [0, 60], [0, 50]]),
    ], 0.5);
    const open = chains.find((chain) => !chain.closed)!;
    expect(open.points.map(([x]) => x)).toEqual([0, 10, 20, 30]);
    const loop = chains.find((chain) => chain.closed)!;
    expect(loop.points).toHaveLength(5);
    expect(chains).toHaveLength(2);
  });

  it("does not join through a junction where three ends meet, nor across styles", () => {
    const chains = chainPaths([
      path([[0, 0], [10, 0]]),
      path([[10, 0], [20, 0]]),
      path([[10, 0], [10, 10]]),
      path([[20, 0], [30, 0]], "#4e4e4e"),
      path([[0, 0], [0, -10]], "#9c9c9c", { closed: true }),
    ], 0.5);
    expect(chains).toHaveLength(5);
    expect(chains.filter((chain) => chain.style === "#9c9c9c/0.48" && !chain.closed).every((chain) => chain.points.length === 2)).toBe(true);
  });
});

describe("bridgeGaps", () => {
  const chain = (points: Point2[], style = "a"): Chain => ({ points, closed: false, style });

  it("joins a label-sized gap that continues the line, nearest first", () => {
    const bridged = bridgeGaps([chain([[0, 0], [5, 0], [10, 0]]), chain([[40, 0], [30, 0], [25, 0]]), chain([[60, 0], [70, 0]])], 20);
    expect(bridged).toHaveLength(1);
    expect(bridged[0]!.points.map(([x]) => x)).toEqual([0, 5, 10, 25, 30, 40, 60, 70]);
  });

  it("leaves gaps that turn, are too long, or change style", () => {
    expect(bridgeGaps([chain([[0, 0], [10, 0]]), chain([[20, 10], [20, 30]])], 30)).toHaveLength(2);
    expect(bridgeGaps([chain([[0, 0], [10, 0]]), chain([[50, 0], [60, 0]])], 30)).toHaveLength(2);
    expect(bridgeGaps([chain([[0, 0], [10, 0]]), chain([[20, 0], [30, 0]], "b")], 30)).toHaveLength(2);
  });

  it("closes a ring broken by one label", () => {
    const arc: Point2[] = Array.from({ length: 30 }, (_, index) => {
      const angle = 0.2 + (index / 29) * (2 * Math.PI - 0.4);
      return [100 * Math.cos(angle), 100 * Math.sin(angle)];
    });
    const [bridged] = bridgeGaps([chain(arc)], 50);
    expect(bridged!.closed).toBe(true);
  });
});

describe("labelChains", () => {
  const chains: Chain[] = [
    { points: [[0, 0], [100, 0]], closed: false, style: "a" },
    { points: [[0, 8], [100, 8]], closed: false, style: "a" },
    { points: [[0, 0], [0, 100]], closed: false, style: "a" },
  ];

  it("gives a chain the value of the labels lying on and along it", () => {
    const labelled = labelChains(chains, [
      { value: 10, x: 50, y: 1, angle: 0, size: 6, width: 10 },
      { value: 10, x: 80, y: -1, angle: Math.PI, size: 6, width: 10 },
      { value: 15, x: 30, y: 7, angle: 0, size: 6, width: 10 },
    ]);
    expect(labelled.map((chain) => chain.value)).toEqual([10, 15, undefined]);
  });

  it("ignores labels across the line and withholds a value when labels disagree", () => {
    const labelled = labelChains(chains, [
      { value: 20, x: 2, y: 50, angle: 0, size: 6, width: 10 },
      { value: 10, x: 20, y: 0, angle: 0, size: 6, width: 10 },
      { value: 15, x: 60, y: 0, angle: 0, size: 6, width: 10 },
    ]);
    expect(labelled[2]!.labels).toEqual([]);
    expect(labelled[0]).toMatchObject({ labels: [10, 15] });
    expect(labelled[0]!.value).toBeUndefined();
  });
});
