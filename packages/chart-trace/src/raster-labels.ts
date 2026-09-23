// Finding the depth labels printed on a scanned chart, so they can be erased
// before tracing: a printed number left in place traces as a scrap of line,
// and a label set in its contour's gap swells the line around it. Labels are
// small and rotated to follow their contour, so they are found as digit-sized
// clusters of ink, each with the reading direction of its own digits or of the
// nearest contour.
//
// Nothing here reads them. Depths are typed by the maker: a machine reads
// labels set into contour lines poorly, and a wrong depth carves a lake bed
// that looks right.

import type { Point2 } from "./local-frame.ts";
import { components, type Mask } from "./raster.ts";

export interface LabelCandidate {
  /** Box in traced pixels. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Centre in traced pixels. */
  x: number;
  y: number;
  /** Height of the tallest glyph, in traced pixels. */
  glyph: number;
  /** Reading direction in radians, y down; ambiguous by half a turn. */
  angle: number;
}

/**
 * Digit-sized ink components grouped into labels. A glyph is taller or
 * wider than `minGlyph` and no bigger than `maxGlyph` either way; glyphs
 * closer than about one glyph height join one label of at most five.
 */
export function labelCandidates(mask: Mask, lines: readonly { points: Point2[] }[], minGlyph: number, maxGlyph: number): LabelCandidate[] {
  const { components: found } = components(mask);
  const glyphs = found.filter((component) => {
    const width = component.right - component.left + 1;
    const height = component.bottom - component.top + 1;
    const long = Math.max(width, height);
    return long >= minGlyph && long <= maxGlyph && Math.min(width, height) >= long * 0.15;
  });
  // Union glyphs whose boxes nearly touch, relative to their size.
  const parent = glyphs.map((_, index) => index);
  const root = (index: number): number => (parent[index] === index ? index : (parent[index] = root(parent[index]!)));
  for (let a = 0; a < glyphs.length; a += 1) {
    for (let b = a + 1; b < glyphs.length; b += 1) {
      const ga = glyphs[a]!;
      const gb = glyphs[b]!;
      const size = Math.max(ga.bottom - ga.top, ga.right - ga.left, gb.bottom - gb.top, gb.right - gb.left) + 1;
      const gapX = Math.max(0, Math.max(ga.left, gb.left) - Math.min(ga.right, gb.right));
      const gapY = Math.max(0, Math.max(ga.top, gb.top) - Math.min(ga.bottom, gb.bottom));
      if (Math.hypot(gapX, gapY) <= size * 0.6) parent[root(b)] = root(a);
    }
  }
  const groups = new Map<number, typeof glyphs>();
  glyphs.forEach((glyph, index) => groups.set(root(index), [...(groups.get(root(index)) ?? []), glyph]));
  const candidates: LabelCandidate[] = [];
  for (const members of groups.values()) {
    if (members.length > 5) continue;
    // A lone mark must be glyph-shaped; dashes, ticks and bars are not labels.
    if (members.length === 1) {
      const only = members[0]!;
      const width = only.right - only.left + 1;
      const height = only.bottom - only.top + 1;
      if (Math.min(width, height) < Math.max(width, height) * 0.4) continue;
    }
    const left = Math.min(...members.map((glyph) => glyph.left));
    const right = Math.max(...members.map((glyph) => glyph.right));
    const top = Math.min(...members.map((glyph) => glyph.top));
    const bottom = Math.max(...members.map((glyph) => glyph.bottom));
    const glyph = Math.max(...members.map((member) => Math.max(member.right - member.left, member.bottom - member.top) + 1));
    if (Math.max(right - left, bottom - top) + 1 > glyph * 6) continue;
    const x = (left + right + 1) / 2;
    const y = (top + bottom + 1) / 2;
    candidates.push({ left, top, right: right + 1, bottom: bottom + 1, x, y, glyph, angle: readingAngle(members, lines, x, y) });
  }
  return candidates;
}

/**
 * Labels set into their contour. At tracing resolution a label that fills
 * its line's gap fuses into one blob, and the skeleton runs straight through
 * it; what gives it away is the stroke swelling to two or three times the
 * line's width for about a label's length. Each swelling reads along the line.
 */
export function bulgeCandidates(lines: readonly { points: Point2[]; widths?: number[] }[], minGlyph: number, maxGlyph: number): LabelCandidate[] {
  const candidates: LabelCandidate[] = [];
  for (const line of lines) {
    const widths = line.widths;
    if (!widths || widths.length < minGlyph * 2) continue;
    const median = [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)]!;
    const swollen = Math.max(median * 1.8, median + minGlyph * 0.5);
    for (let start = 0; start < widths.length;) {
      if (widths[start]! <= swollen) {
        start += 1;
        continue;
      }
      let end = start;
      while (end + 1 < widths.length && widths[end + 1]! > swollen) end += 1;
      const run = line.points.slice(start, end + 1);
      // The swollen stroke is a little narrower than the glyphs that fill it.
      const glyph = Math.max(...widths.slice(start, end + 1)) * 1.3;
      const length = Math.hypot(run.at(-1)![0] - run[0]![0], run.at(-1)![1] - run[0]![1]) + glyph;
      if (glyph >= minGlyph && glyph <= maxGlyph * 1.5 && length >= glyph * 0.6 && length <= glyph * 6) {
        // Direction from the line either side of the run, so the blob's own wobble does not tilt it.
        const before = line.points[Math.max(0, start - Math.ceil(glyph))]!;
        const after = line.points[Math.min(line.points.length - 1, end + Math.ceil(glyph))]!;
        const x = run.reduce((sum, [px]) => sum + px, 0) / run.length;
        const y = run.reduce((sum, [, py]) => sum + py, 0) / run.length;
        const angle = Math.atan2(after[1] - before[1], after[0] - before[0]);
        // A depth label is two or three glyphs long, often longer than the swelling itself.
        const half = Math.max(length, glyph * 2.6) / 2;
        const reachX = Math.abs(Math.cos(angle)) * half + Math.abs(Math.sin(angle)) * glyph / 2;
        const reachY = Math.abs(Math.sin(angle)) * half + Math.abs(Math.cos(angle)) * glyph / 2;
        candidates.push({ left: x - reachX, right: x + reachX, top: y - reachY, bottom: y + reachY, x, y, glyph, angle });
      }
      start = end + 1;
    }
  }
  return candidates;
}

/** Candidates from both searches, dropping any that mostly overlap one already kept. */
export function mergeCandidates(...lists: LabelCandidate[][]): LabelCandidate[] {
  const kept: LabelCandidate[] = [];
  for (const candidate of lists.flat()) {
    const overlaps = kept.some((other) => {
      const width = Math.min(candidate.right, other.right) - Math.max(candidate.left, other.left);
      const height = Math.min(candidate.bottom, other.bottom) - Math.max(candidate.top, other.top);
      if (width <= 0 || height <= 0) return false;
      const smaller = Math.min((candidate.right - candidate.left) * (candidate.bottom - candidate.top), (other.right - other.left) * (other.bottom - other.top));
      return width * height >= smaller * 0.5;
    });
    if (!overlaps) kept.push(candidate);
  }
  return kept;
}

function readingAngle(members: readonly { left: number; right: number; top: number; bottom: number }[], lines: readonly { points: Point2[] }[], x: number, y: number): number {
  // Several glyphs: the line through their centres.
  if (members.length >= 2) return principalAngle(members.map((glyph): Point2 => [(glyph.left + glyph.right) / 2, (glyph.top + glyph.bottom) / 2]));
  // A single glyph reads along the nearest contour: the principal direction of
  // that line's points around it, since its nearest end is often a ragged stub
  // where the label was erased.
  let nearest: { distance: number; line: readonly Point2[] } | undefined;
  for (const line of lines) {
    for (let index = 1; index < line.points.length; index += 1) {
      const [x1, y1] = line.points[index - 1]!;
      const [x2, y2] = line.points[index]!;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const span = dx * dx + dy * dy;
      if (!span) continue;
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / span));
      const distance = Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
      if (!nearest || distance < nearest.distance) nearest = { distance, line: line.points };
    }
  }
  if (!nearest) return 0;
  const size = Math.max(...members.map((glyph) => Math.max(glyph.right - glyph.left, glyph.bottom - glyph.top) + 1));
  const reach = nearest.distance + size * 3;
  const around: Point2[] = [];
  const line = nearest.line;
  for (let index = 1; index < line.length; index += 1) {
    // Sample along segments so sparse simplified vertices still count.
    const [x1, y1] = line[index - 1]!;
    const [x2, y2] = line[index]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
    for (let step = 0; step <= steps; step += 1) {
      const px = x1 + ((x2 - x1) * step) / steps;
      const py = y1 + ((y2 - y1) * step) / steps;
      if (Math.hypot(px - x, py - y) <= reach) around.push([px, py]);
    }
  }
  return principalAngle(around);
}

function principalAngle(points: readonly Point2[]): number {
  if (points.length < 2) return 0;
  const mx = points.reduce((sum, [px]) => sum + px, 0) / points.length;
  const my = points.reduce((sum, [, py]) => sum + py, 0) / points.length;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const [px, py] of points) {
    xx += (px - mx) ** 2;
    yy += (py - my) ** 2;
    xy += (px - mx) * (py - my);
  }
  return 0.5 * Math.atan2(2 * xy, xx - yy);
}
