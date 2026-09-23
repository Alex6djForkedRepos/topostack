import type { Point2D } from "../types.js";
import { flattenPath } from "./font-data.js";

/** One absolute drawing command: the compact form `flattenPath` reads. */
export type AbsolutePathCommand =
  | ["M", number, number]
  | ["L", number, number]
  | ["Q", number, number, number, number]
  | ["C", number, number, number, number, number, number]
  | ["Z"];

/** A flattened subpath in the path's own units; `closed` when it ended with Z. */
export interface PathPolyline {
  points: Point2D[];
  closed: boolean;
}

const COMMAND_ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Reads SVG path data (every command, relative or absolute, arcs included)
 * into absolute M/L/Q/C/Z. After Z a subpath that goes on drawing without a
 * move starts from the closed point, as SVG says, so an explicit M is written.
 * Malformed data stops at the first bad token, as browsers render up to it.
 */
export function absolutePathCommands(data: string): AbsolutePathCommand[] {
  const commands: AbsolutePathCommand[] = [];
  let position = 0;
  const skipSeparators = () => {
    while (position < data.length && /[\s,]/.test(data[position]!)) position += 1;
  };
  const readNumber = (): number | undefined => {
    skipSeparators();
    const match = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(data.slice(position, position + 64));
    if (!match) return undefined;
    position += match[0].length;
    return Number(match[0]);
  };
  // Arc flags are single digits and may run together with what follows ("011 1").
  const readFlag = (): number | undefined => {
    skipSeparators();
    const flag = data[position];
    if (flag !== "0" && flag !== "1") return undefined;
    position += 1;
    return Number(flag);
  };
  let x = 0; let y = 0; let startX = 0; let startY = 0;
  let controlX = 0; let controlY = 0;
  let previous = "";
  let closedSincePreviousMove = false;
  let command = "";
  for (;;) {
    skipSeparators();
    if (position >= data.length) break;
    const letter = data[position]!;
    if (/[a-zA-Z]/.test(letter)) {
      if (COMMAND_ARITY[letter.toUpperCase()] === undefined) break;
      command = letter;
      position += 1;
    } else if (!command || command.toUpperCase() === "Z") {
      break;
    }
    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (upper !== "M" && upper !== "Z" && closedSincePreviousMove) {
      commands.push(["M", x, y]);
      closedSincePreviousMove = false;
    }
    if (upper === "Z") {
      commands.push(["Z"]);
      x = startX; y = startY;
      closedSincePreviousMove = true;
      previous = "Z";
      continue;
    }
    const values: number[] = [];
    for (let index = 0; index < COMMAND_ARITY[upper]!; index += 1) {
      const value = upper === "A" && (index === 3 || index === 4) ? readFlag() : readNumber();
      if (value === undefined) return commands;
      values.push(value);
    }
    const dx = relative ? x : 0;
    const dy = relative ? y : 0;
    switch (upper) {
      case "M":
        x = values[0]! + dx; y = values[1]! + dy; startX = x; startY = y;
        commands.push(["M", x, y]);
        closedSincePreviousMove = false;
        // Further pairs after a move are lines.
        command = relative ? "l" : "L";
        break;
      case "L": x = values[0]! + dx; y = values[1]! + dy; commands.push(["L", x, y]); break;
      case "H": x = values[0]! + dx; commands.push(["L", x, y]); break;
      case "V": y = values[0]! + dy; commands.push(["L", x, y]); break;
      case "C": {
        const x1 = values[0]! + dx; const y1 = values[1]! + dy;
        controlX = values[2]! + dx; controlY = values[3]! + dy;
        x = values[4]! + dx; y = values[5]! + dy;
        commands.push(["C", x1, y1, controlX, controlY, x, y]);
        break;
      }
      case "S": {
        const x1 = previous === "C" || previous === "S" ? 2 * x - controlX : x;
        const y1 = previous === "C" || previous === "S" ? 2 * y - controlY : y;
        controlX = values[0]! + dx; controlY = values[1]! + dy;
        x = values[2]! + dx; y = values[3]! + dy;
        commands.push(["C", x1, y1, controlX, controlY, x, y]);
        break;
      }
      case "Q":
        controlX = values[0]! + dx; controlY = values[1]! + dy;
        x = values[2]! + dx; y = values[3]! + dy;
        commands.push(["Q", controlX, controlY, x, y]);
        break;
      case "T":
        controlX = previous === "Q" || previous === "T" ? 2 * x - controlX : x;
        controlY = previous === "Q" || previous === "T" ? 2 * y - controlY : y;
        x = values[0]! + dx; y = values[1]! + dy;
        commands.push(["Q", controlX, controlY, x, y]);
        break;
      case "A": {
        const endX = values[5]! + dx; const endY = values[6]! + dy;
        commands.push(...arcToCubics(x, y, values[0]!, values[1]!, values[2]!, values[3] === 1, values[4] === 1, endX, endY));
        x = endX; y = endY;
        break;
      }
    }
    previous = upper;
  }
  return commands;
}

/**
 * An elliptical arc as cubic Béziers of at most a quarter turn each, following
 * the SVG endpoint-to-center conversion (radii grow when too small; zero
 * radii draw a straight line).
 */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, rotationDeg: number, largeArc: boolean, sweep: boolean, x2: number, y2: number): AbsolutePathCommand[] {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [["L", x2, y2]];
  const phi = rotationDeg * Math.PI / 180;
  const cos = Math.cos(phi); const sin = Math.sin(phi);
  const halfX = (x1 - x2) / 2; const halfY = (y1 - y2) / 2;
  const px = cos * halfX + sin * halfY;
  const py = -sin * halfX + cos * halfY;
  const lambda = px * px / (rx * rx) + py * py / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const numerator = Math.max(0, rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px);
  const denominator = rx * rx * py * py + ry * ry * px * px;
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(numerator / denominator);
  const cxPrime = factor * rx * py / ry;
  const cyPrime = -factor * ry * px / rx;
  const cx = cos * cxPrime - sin * cyPrime + (x1 + x2) / 2;
  const cy = sin * cxPrime + cos * cyPrime + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta = angle(1, 0, (px - cxPrime) / rx, (py - cyPrime) / ry);
  let delta = angle((px - cxPrime) / rx, (py - cyPrime) / ry, (-px - cxPrime) / rx, (-py - cyPrime) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / segments;
  const handle = 4 / 3 * Math.tan(step / 4);
  const point = (t: number) => ({
    x: cx + cos * rx * Math.cos(t) - sin * ry * Math.sin(t),
    y: cy + sin * rx * Math.cos(t) + cos * ry * Math.sin(t),
  });
  const derivative = (t: number) => ({
    x: -cos * rx * Math.sin(t) - sin * ry * Math.cos(t),
    y: -sin * rx * Math.sin(t) + cos * ry * Math.cos(t),
  });
  const commands: AbsolutePathCommand[] = [];
  for (let index = 0; index < segments; index += 1) {
    const start = theta + step * index;
    const end = start + step;
    const from = point(start); const to = index === segments - 1 ? { x: x2, y: y2 } : point(end);
    const fromDerivative = derivative(start); const toDerivative = derivative(end);
    commands.push(["C", from.x + handle * fromDerivative.x, from.y + handle * fromDerivative.y, to.x - handle * toDerivative.x, to.y - handle * toDerivative.y, to.x, to.y]);
  }
  return commands;
}

/** Serializes commands in the compact form `flattenPath` reads: letters, single spaces. */
function compactPath(commands: AbsolutePathCommand[]): string {
  return commands.map(([type, ...values]) => `${type}${values.join(" ")}`).join("");
}

/**
 * SVG path data as polylines, curves flattened to within `tolerance` of the
 * true curve (in the path's own units).
 */
export function flattenSvgPath(data: string, tolerance: number): PathPolyline[] {
  const { open, closed } = flattenPath(compactPath(absolutePathCommands(data)), tolerance);
  return [...open.map((points) => ({ points, closed: false })), ...closed.map((points) => ({ points, closed: true }))];
}
