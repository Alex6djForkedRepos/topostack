// Contour levels from topology. A chart labels only some of its lines; the
// rest follow from the rule that the space between neighbouring contours is
// a band spanning exactly one interval. Rasterize the lines, flood the space
// between them into regions, and solve the resulting constraints: a region
// touching lines of two levels is the band between them, and a line lies at
// the level its bands on either side share. The shoreline seeds the outermost
// band, whose other edge is one interval inward.

import type { Point2 } from "./local-frame.ts";

export interface LevelLine {
  points: Point2[];
  closed: boolean;
  /** A labelled level, when known. */
  value?: number;
}

export interface LevelInput {
  lines: LevelLine[];
  /** The shoreline and the level it stands for (depth 0, or the surface elevation). */
  shoreline?: { rings: Point2[][]; value: number };
  interval: number;
  /** +1 when values grow away from the shore (depths), -1 when they shrink (elevations). */
  inward: 1 | -1;
  width: number;
  height: number;
  /** Raster cell size in page units; defaults so the longer side is at most 2048 cells. */
  cellSize?: number;
}

export interface LevelResult {
  values: (number | undefined)[];
  /** Lines whose level was inferred rather than labelled. */
  inferred: boolean[];
  /** Labelled lines that no band around them agrees with. */
  conflicts: number[];
  /** Spaces between lines: how many were settled into a band, and how many touch levels no single band can hold. */
  regions: { total: number; banded: number; contradictory: number };
}

const EPSILON = 1e-6;
/** Samples per line for the sideways vote, how far a ray looks in cells, and what counts as a decision. */
const RAY_SAMPLES = 60;
const RAY_REACH_CELLS = 120;
const RAY_MIN_VOTES = 3;
const RAY_MIN_SHARE = 0.75;
/** Regions smaller than this are pockets left by drawing, not the space between lines. */
const MIN_SIDE_CELLS = 16;

export function inferLevels(input: LevelInput): LevelResult {
  const { lines, interval, inward } = input;
  if (!(interval > 0)) throw new Error("Level inference needs a positive contour interval.");
  const cellSize = input.cellSize ?? Math.max(input.width, input.height) / 2048;
  const width = Math.max(1, Math.ceil(input.width / cellSize));
  const height = Math.max(1, Math.ceil(input.height / cellSize));
  const shoreId = lines.length;
  const owner = new Int32Array(width * height).fill(-1);

  // Lines are drawn 8-connected, which a 4-connected flood cannot cross.
  const draw = (points: readonly Point2[], closed: boolean, id: number) => {
    const ring = closed ? [...points, points[0]!] : points;
    for (let index = 0; index < ring.length; index += 1) {
      const [x1, y1] = ring[Math.max(0, index - 1)]!;
      const [x2, y2] = ring[index]!;
      const steps = Math.max(1, Math.ceil((Math.hypot(x2 - x1, y2 - y1) / cellSize) * 2));
      for (let step = 0; step <= steps; step += 1) {
        const column = Math.floor((x1 + ((x2 - x1) * step) / steps) / cellSize);
        const row = Math.floor((y1 + ((y2 - y1) * step) / steps) / cellSize);
        if (row < 0 || column < 0 || row >= height || column >= width) continue;
        const cell = row * width + column;
        if (owner[cell] === -1) owner[cell] = id;
      }
    }
  };
  for (const ring of input.shoreline?.rings ?? []) draw(ring, true, shoreId);
  lines.forEach((line, index) => draw(line.points, line.closed, index));

  const region = new Int32Array(width * height).fill(-1);
  const regionSize: number[] = [];
  let regions = 0;
  const stack: number[] = [];
  for (let start = 0; start < owner.length; start += 1) {
    if (owner[start] !== -1 || region[start] !== -1) continue;
    region[start] = regions;
    regionSize.push(0);
    stack.push(start);
    while (stack.length) {
      const cell = stack.pop()!;
      regionSize[regions]! += 1;
      const row = Math.floor(cell / width);
      const column = cell % width;
      for (const next of [row > 0 ? cell - width : -1, row < height - 1 ? cell + width : -1, column > 0 ? cell - 1 : -1, column < width - 1 ? cell + 1 : -1]) {
        if (next < 0 || owner[next] !== -1 || region[next] !== -1) continue;
        region[next] = regions;
        stack.push(next);
      }
    }
    regions += 1;
  }

  const lineRegions = Array.from({ length: lines.length + 1 }, () => new Set<number>());
  const regionLines = Array.from({ length: regions }, () => new Set<number>());
  for (let cell = 0; cell < owner.length; cell += 1) {
    const id = owner[cell]!;
    if (id < 0) continue;
    const row = Math.floor(cell / width);
    const column = cell % width;
    for (const next of [row > 0 ? cell - width : -1, row < height - 1 ? cell + width : -1, column > 0 ? cell - 1 : -1, column < width - 1 ? cell + 1 : -1]) {
      if (next < 0 || owner[next] !== -1) continue;
      lineRegions[id]!.add(region[next]!);
      regionLines[region[next]!]!.add(id);
    }
  }

  const values: (number | undefined)[] = [...lines.map((line) => line.value), input.shoreline?.value];
  const inferred = new Array<boolean>(lines.length).fill(false);
  const same = (a: number, b: number) => Math.abs(a - b) < EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
  // Levels form a ladder: every interval, aligned to the labels, plus the
  // surface, which need not fall on it (a reservoir at 322 ft with 5 ft contours).
  const offset = lines.find((line) => line.value !== undefined)?.value ?? input.shoreline?.value ?? 0;
  const step = (value: number) => (value - offset) / interval;
  /** Whether a and b are neighbouring rungs, the two edges of one band. */
  const adjacent = (a: number, b: number) => {
    if (same(a, b)) return false;
    const [low, high] = a < b ? [a, b] : [b, a];
    const firstRungAbove = Math.floor(step(low) + 1e-6) + 1;
    return offset + firstRungAbove * interval >= high - EPSILON * Math.max(1, Math.abs(high));
  };
  /** The next rung inward from a level. */
  const inwardOf = (value: number) => {
    const rung = step(value);
    const next = inward > 0 ? Math.floor(rung + 1e-6) + 1 : Math.ceil(rung - 1e-6) - 1;
    return offset + next * interval;
  };
  type Band = { low: number; high: number } | "bad" | undefined;
  const bands: Band[] = new Array(regions).fill(undefined);

  const settleBand = (index: number): Band => {
    const known: number[] = [];
    for (const id of regionLines[index]!) {
      const value = values[id];
      if (value !== undefined && !known.some((other) => same(other, value))) known.push(value);
    }
    if (known.length > 2) return "bad";
    if (known.length === 2) {
      const [a, b] = known as [number, number];
      return adjacent(a, b) ? { low: Math.min(a, b), high: Math.max(a, b) } : "bad";
    }
    // A band on the shore reaches the next rung inward from it.
    if (known.length === 1 && regionLines[index]!.has(shoreId) && input.shoreline && same(known[0]!, input.shoreline.value)) {
      const inner = inwardOf(input.shoreline.value);
      return { low: Math.min(input.shoreline.value, inner), high: Math.max(input.shoreline.value, inner) };
    }
    return undefined;
  };

  /** The rung on the far side of `level` from `other`. */
  const beyond = (level: number, other: number) => {
    const rung = step(level);
    return offset + (other < level ? Math.floor(rung + 1e-6) + 1 : Math.ceil(rung - 1e-6) - 1) * interval;
  };
  /** Records what a region must be; evidence that disagrees makes it contradictory. */
  const assign = (index: number, band: Band): boolean => {
    const current = bands[index];
    if (current === "bad" || band === undefined) return false;
    if (band === "bad") {
      bands[index] = "bad";
      return true;
    }
    if (current === undefined) {
      bands[index] = band;
      return true;
    }
    if (same(current.low, band.low) && same(current.high, band.high)) return false;
    bands[index] = "bad";
    return true;
  };

  for (let changed = true; changed;) {
    changed = false;
    for (let index = 0; index < regions; index += 1) changed = assign(index, settleBand(index)) || changed;
    // A contour at level L parts the band below L from the band above it, so
    // knowing one side of a known line gives the other side.
    [...lines, undefined].forEach((_, id) => {
      const level = values[id];
      if (level === undefined) return;
      // Drawing a curve leaves pockets of a cell or two along it; they are not sides.
      const sides = [...lineRegions[id]!].filter((side) => regionSize[side]! >= MIN_SIDE_CELLS);
      if (sides.length !== 2) return;
      for (const [from, to] of [[sides[0]!, sides[1]!], [sides[1]!, sides[0]!]] as const) {
        const band = bands[from];
        if (!band || band === "bad" || bands[to] !== undefined) continue;
        const other = same(band.low, level) ? band.high : same(band.high, level) ? band.low : undefined;
        if (other === undefined) continue;
        const far = beyond(level, other);
        changed = assign(to, { low: Math.min(level, far), high: Math.max(level, far) }) || changed;
      }
    });
    lines.forEach((_, id) => {
      if (values[id] !== undefined) return;
      const sides = [...lineRegions[id]!];
      // A line with the same region on both sides is a dangling fragment; it bounds nothing.
      if (sides.length < 2) return;
      let candidates: number[] | undefined;
      for (const side of sides) {
        const band = bands[side];
        if (!band || band === "bad") continue;
        const pair = [band.low, band.high];
        candidates = candidates ? candidates.filter((value) => pair.some((other) => same(other, value))) : pair;
      }
      // A band whose known lines all lie on one edge, with this as its only
      // unknown line, has this line as its other edge. (An unlabelled hump
      // ring of the same level would be misread here; charts label those.)
      if (candidates?.length !== 1) {
        for (const side of sides) {
          const band = bands[side];
          if (!band || band === "bad" || regionSize[side]! < MIN_SIDE_CELLS) continue;
          const members = [...regionLines[side]!];
          if (members.some((other) => other !== id && values[other] === undefined)) continue;
          const edges = new Set(members.filter((other) => other !== id).map((other) => (same(values[other]!, band.low) ? "low" : same(values[other]!, band.high) ? "high" : "neither")));
          if (edges.size !== 1 || edges.has("neither")) continue;
          candidates = [edges.has("low") ? band.high : band.low];
          break;
        }
      }
      if (candidates?.length === 1) {
        values[id] = candidates[0];
        inferred[id] = true;
        changed = true;
      }
    });
    // Regions on a real chart leak through shoreline gaps and merge where
    // lines crowd closer than a cell, so also vote locally along each line.
    lines.forEach((line, id) => {
      if (values[id] !== undefined) return;
      const vote = rayVote(line, id);
      if (vote === undefined) return;
      values[id] = vote;
      inferred[id] = true;
      changed = true;
    });
  }

  /**
   * Samples points along a line and looks sideways both ways for the first
   * other line. Where both neighbours are known and exactly one rung lies
   * between them, that rung is this line's level. A clear majority decides.
   */
  function rayVote(line: LevelLine, id: number): number | undefined {
    const ring = line.closed ? [...line.points, line.points[0]!] : line.points;
    let total = 0;
    for (let index = 1; index < ring.length; index += 1) total += Math.hypot(ring[index]![0] - ring[index - 1]![0], ring[index]![1] - ring[index - 1]![1]);
    const spacing = Math.max(cellSize * 3, total / RAY_SAMPLES);
    const reach = RAY_REACH_CELLS;
    const tally = new Map<number, number>();
    let cast = 0;
    let travelled = 0;
    let nextSample = spacing / 2;
    for (let index = 1; index < ring.length; index += 1) {
      const [x1, y1] = ring[index - 1]!;
      const [x2, y2] = ring[index]!;
      const span = Math.hypot(x2 - x1, y2 - y1);
      if (!span) continue;
      const normal: Point2 = [-(y2 - y1) / span, (x2 - x1) / span];
      while (nextSample <= travelled + span) {
        const t = (nextSample - travelled) / span;
        const x = x1 + t * (x2 - x1);
        const y = y1 + t * (y2 - y1);
        const hit = (sign: number) => {
          let left = false;
          for (let k = 1; k <= reach; k += 1) {
            const column = Math.floor((x + sign * normal[0] * k * cellSize) / cellSize);
            const row = Math.floor((y + sign * normal[1] * k * cellSize) / cellSize);
            if (row < 0 || column < 0 || row >= height || column >= width) return undefined;
            const other = owner[row * width + column]!;
            if (other === -1) {
              left = true;
              continue;
            }
            if (other === id) {
              // Still inside this line's own stroke, or it looped back on itself.
              if (left) return undefined;
              continue;
            }
            return values[other];
          }
          return undefined;
        };
        const a = hit(1);
        const b = hit(-1);
        cast += 1;
        if (a !== undefined && b !== undefined && !same(a, b)) {
          const [low, high] = a < b ? [a, b] : [b, a];
          const rungs: number[] = [];
          for (let rung = Math.floor(step(low) + 1e-6) + 1; offset + rung * interval < high - EPSILON * Math.max(1, Math.abs(high)); rung += 1) rungs.push(offset + rung * interval);
          if (rungs.length === 1) tally.set(rungs[0]!, (tally.get(rungs[0]!) ?? 0) + 1);
        }
        nextSample += spacing;
      }
      travelled += span;
    }
    let best: [number, number] | undefined;
    let votes = 0;
    for (const entry of tally) {
      votes += entry[1];
      if (!best || entry[1] > best[1]) best = entry;
    }
    if (!best || best[1] < RAY_MIN_VOTES || best[1] < votes * RAY_MIN_SHARE || cast === 0) return undefined;
    return best[0];
  }

  // A label is in conflict when a region beside it holds labels no single band
  // can: the labels themselves disagree. Contradictions that involve inferred
  // lines usually mean a leak between regions, not a wrong label.
  const conflicts: number[] = [];
  lines.forEach((line, id) => {
    if (line.value === undefined) return;
    for (const side of lineRegions[id]!) {
      const labelled: number[] = [];
      for (const other of regionLines[side]!) {
        const value = other === shoreId ? input.shoreline?.value : lines[other]!.value;
        if (value !== undefined && !labelled.some((seen) => same(seen, value))) labelled.push(value);
      }
      const [a, b] = labelled;
      if (labelled.length > 2 || (a !== undefined && b !== undefined && !adjacent(a, b))) {
        conflicts.push(id);
        return;
      }
    }
  });
  return {
    values: values.slice(0, lines.length),
    inferred,
    conflicts,
    regions: { total: regions, banded: bands.filter((band) => band && band !== "bad").length, contradictory: bands.filter((band) => band === "bad").length },
  };
}
