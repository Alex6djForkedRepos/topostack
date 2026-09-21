import { anchoredCenter } from "./anchor.js";
import { labelDimensions } from "./labels.js";
import type { OperationPath, Point2D, ProjectConfigV1, TextStyleV1 } from "../types.js";

function circle(radius: number, steps = 48): Point2D[] {
  const points = Array.from({ length: steps }, (_, index) => {
    const angle = -Math.PI / 2 + (index / steps) * Math.PI * 2;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  return [...points, { ...points[0]! }];
}

function star(pointRadii: number[], valleyRadius: number): Point2D[] {
  const points = pointRadii.flatMap((radius, index) => {
    const tipAngle = -Math.PI / 2 + (index / pointRadii.length) * Math.PI * 2;
    const valleyAngle = tipAngle + Math.PI / pointRadii.length;
    return [
      { x: Math.cos(tipAngle) * radius, y: Math.sin(tipAngle) * radius },
      { x: Math.cos(valleyAngle) * valleyRadius, y: Math.sin(valleyAngle) * valleyRadius },
    ];
  });
  return [...points, { ...points[0]! }];
}

function centerFor(config: ProjectConfigV1): Point2D {
  const halfSymbol = config.northArrowSizeMm / 2;
  return anchoredCenter(config, config.northArrowPlacement, halfSymbol, halfSymbol);
}

function transform(points: Point2D[], center: Point2D, sizeMm: number): Point2D[] {
  return points.map((point) => ({ x: center.x + point.x * sizeMm, y: center.y + point.y * sizeMm }));
}

function path(id: string, points: Point2D[], center: Point2D, sizeMm: number): OperationPath {
  return { id: `north-${id}`, operation: "engrave", kind: "guide", points: transform(points, center, sizeMm) };
}

function letter(id: string, value: string, localCenter: Point2D, sizeFraction: number, center: Point2D, sizeMm: number): OperationPath {
  const textStyle: TextStyleV1 = { font: "technical", sizeMm: sizeMm * sizeFraction };
  const dimensions = labelDimensions(value, textStyle);
  return {
    id: `north-${id}`,
    operation: "engrave",
    kind: "label",
    points: [{ x: center.x + localCenter.x * sizeMm - dimensions.width / 2, y: center.y + localCenter.y * sizeMm - dimensions.height / 2 }],
    label: value,
    textStyle,
  };
}

function minimalMarkings(center: Point2D, sizeMm: number): OperationPath[] {
  return [
    path("minimal-pointer", [{ x: 0, y: -0.3 }, { x: -0.115, y: 0.04 }, { x: 0, y: -0.02 }, { x: 0.115, y: 0.04 }, { x: 0, y: -0.3 }], center, sizeMm),
    path("minimal-stem", [{ x: 0, y: -0.02 }, { x: 0, y: 0.38 }], center, sizeMm),
    path("minimal-foot", [{ x: -0.08, y: 0.3 }, { x: 0.08, y: 0.3 }], center, sizeMm),
    letter("minimal-label-n", "N", { x: 0, y: -0.43 }, 0.11, center, sizeMm),
  ];
}

function classicMarkings(center: Point2D, sizeMm: number): OperationPath[] {
  const labels: Array<[string, string, Point2D]> = [
    ["n", "N", { x: 0, y: -0.44 }], ["e", "E", { x: 0.44, y: 0 }],
    ["s", "S", { x: 0, y: 0.44 }], ["w", "W", { x: -0.44, y: 0 }],
  ];
  return [
    path("classic-rose", star([0.34, 0.29, 0.29, 0.29], 0.075), center, sizeMm),
    path("classic-ring", circle(0.19), center, sizeMm),
    path("classic-center", circle(0.055, 24), center, sizeMm),
    ...labels.map(([id, value, point]) => letter(`classic-label-${id}`, value, point, 0.09, center, sizeMm)),
  ];
}

function marinerMarkings(center: Point2D, sizeMm: number): OperationPath[] {
  const ticks = Array.from({ length: 16 }, (_, index) => {
    const angle = -Math.PI / 2 + (index / 16) * Math.PI * 2;
    const inner = index % 2 === 0 ? 0.35 : 0.375;
    return path(`mariner-tick-${index + 1}`, [
      { x: Math.cos(angle) * inner, y: Math.sin(angle) * inner },
      { x: Math.cos(angle) * 0.43, y: Math.sin(angle) * 0.43 },
    ], center, sizeMm);
  });
  return [
    path("mariner-outer-ring", circle(0.45, 64), center, sizeMm),
    path("mariner-inner-ring", circle(0.35, 64), center, sizeMm),
    path("mariner-rose", star([0.33, 0.24, 0.3, 0.24, 0.3, 0.24, 0.3, 0.24], 0.07), center, sizeMm),
    path("mariner-center", circle(0.055, 24), center, sizeMm),
    ...ticks,
  ];
}

export function northArrowMarkings(config: ProjectConfigV1): OperationPath[] {
  const center = centerFor(config);
  if (config.northArrowStyle === "minimal") return minimalMarkings(center, config.northArrowSizeMm);
  if (config.northArrowStyle === "mariner") return marinerMarkings(center, config.northArrowSizeMm);
  return classicMarkings(center, config.northArrowSizeMm);
}

/** Reserved material area for the selected compass, including its visual breathing room. */
export function northArrowFootprint(config: ProjectConfigV1): Point2D[] {
  return transform(circle(0.5, 64), centerFor(config), config.northArrowSizeMm);
}
