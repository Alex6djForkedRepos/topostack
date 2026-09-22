// Reads one page of a vector PDF chart into styled polylines and positioned
// text with pdf.js. The caller passes pdf.js in, so this package never
// bundles it: the batch build hands over the Node "legacy" build, and the
// studio worker the browser build it loads lazily. pdf.js 6 is required
// (5.x carries a published vulnerability); it packs each path as
// [paint operator, [path ops], bounds].

import type { Point2 } from "./local-frame.ts";
import type { VectorPage, VectorPath, VectorText } from "./vector-page.ts";

/** The slice of the pdf.js API this module uses. */
export interface PdfJs {
  OPS: Record<string, number>;
  getDocument(source: { data: Uint8Array; disableFontFace?: boolean; isEvalSupported?: boolean; verbosity?: number }): { promise: Promise<PdfDocument>; destroy(): Promise<void> };
}

interface PdfDocument {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPage>;
}

interface PdfPage {
  view: number[];
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  getTextContent(): Promise<{ items: unknown[] }>;
}

type Matrix = [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
/** Path ops inside pdf.js's packed path data. */
const MOVE_TO = 0;
const LINE_TO = 1;
const CURVE_TO = 2;
const QUADRATIC_CURVE_TO = 3;
const CLOSE_PATH = 4;
const CURVE_STEPS = 8;

function compose(m: Matrix, n: Matrix): Matrix {
  // Applies n first, then m, matching PDF's `cm` semantics (new = n x current).
  return [
    n[0] * m[0] + n[1] * m[2], n[0] * m[1] + n[1] * m[3],
    n[2] * m[0] + n[3] * m[2], n[2] * m[1] + n[3] * m[3],
    n[4] * m[0] + n[5] * m[2] + m[4], n[4] * m[1] + n[5] * m[3] + m[5],
  ];
}

function colour(value: unknown): string | undefined {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object" && "length" in value) {
    const [r, g, b] = Array.from(value as ArrayLike<number>);
    return `#${[r, g, b].map((channel) => Math.round(channel ?? 0).toString(16).padStart(2, "0")).join("")}`;
  }
  return undefined;
}

function bezier(p0: Point2, p1: Point2, p2: Point2, p3: Point2): Point2[] {
  const out: Point2[] = [];
  for (let step = 1; step <= CURVE_STEPS; step += 1) {
    const t = step / CURVE_STEPS;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

export async function readPdfPage(pdfjs: PdfJs, data: Uint8Array, pageNumber = 1): Promise<VectorPage> {
  const task = pdfjs.getDocument({ data, disableFontFace: true, isEvalSupported: false, verbosity: 0 });
  try {
    const document = await task.promise;
    if (pageNumber < 1 || pageNumber > document.numPages) throw new Error(`The PDF has no page ${pageNumber}.`);
    const page = await document.getPage(pageNumber);
    const [left = 0, bottom = 0, right = 0, top = 0] = page.view;
    const toPage = (x: number, y: number): Point2 => [x - left, top - y];
    const { OPS } = pdfjs;
    const operators = await page.getOperatorList();
    const paths: VectorPath[] = [];
    const stack: { ctm: Matrix; stroke?: string; fill?: string; lineWidth: number; dashed: boolean }[] = [];
    let state = { ctm: IDENTITY, stroke: "#000000" as string | undefined, fill: "#000000" as string | undefined, lineWidth: 1, dashed: false };
    operators.fnArray.forEach((fn, index) => {
      const args = (operators.argsArray[index] ?? []) as unknown[];
      if (fn === OPS.save) stack.push({ ...state });
      else if (fn === OPS.restore) state = { ...state, ...(stack.pop() ?? {}) };
      else if (fn === OPS.transform) state = { ...state, ctm: compose(state.ctm, args as Matrix) };
      else if (fn === OPS.paintFormXObjectBegin) {
        stack.push({ ...state });
        if (Array.isArray(args[0]) || (args[0] && typeof args[0] === "object")) state = { ...state, ctm: compose(state.ctm, Array.from(args[0] as ArrayLike<number>) as Matrix) };
      } else if (fn === OPS.paintFormXObjectEnd) state = { ...state, ...(stack.pop() ?? {}) };
      else if (fn === OPS.setStrokeRGBColor) state = { ...state, stroke: colour(args[0] ?? args) };
      else if (fn === OPS.setFillRGBColor) state = { ...state, fill: colour(args[0] ?? args) };
      else if (fn === OPS.setLineWidth) state = { ...state, lineWidth: Number(args[0]) };
      else if (fn === OPS.setDash) state = { ...state, dashed: Array.isArray(args[0]) && args[0].length > 0 };
      else if (fn === OPS.constructPath) {
        const paint = args[0] as number;
        const strokes = [OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint);
        const fills = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].includes(paint);
        if (!strokes && !fills) return;
        const packed = (args[1] as ArrayLike<number>[] | undefined)?.[0];
        if (!packed || typeof packed.length !== "number") throw new Error("This PDF reader needs pdf.js 6 or later.");
        const { ctm } = state;
        const map = (x: number, y: number) => toPage(ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]);
        // The page-space scale of the line width, for a uniform CTM.
        const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
        let current: VectorPath | undefined;
        let pen: Point2 = [0, 0];
        let start: Point2 = [0, 0];
        const open = () => {
          current = { ...(strokes ? { stroke: state.stroke } : {}), ...(fills ? { fill: state.fill } : {}), lineWidth: state.lineWidth * scale, dashed: state.dashed, points: [map(pen[0], pen[1])], closed: false };
          paths.push(current);
        };
        for (let k = 0; k < packed.length;) {
          const op = packed[k]!;
          if (op === MOVE_TO) {
            pen = [packed[k + 1]!, packed[k + 2]!];
            start = pen;
            open();
            k += 3;
          } else if (op === LINE_TO) {
            // After a close, drawing continues from the subpath's start.
            if (!current) open();
            pen = [packed[k + 1]!, packed[k + 2]!];
            current!.points.push(map(pen[0], pen[1]));
            k += 3;
          } else if (op === CURVE_TO || op === QUADRATIC_CURVE_TO) {
            const quadratic = op === QUADRATIC_CURVE_TO;
            const end: Point2 = quadratic ? [packed[k + 3]!, packed[k + 4]!] : [packed[k + 5]!, packed[k + 6]!];
            const c1: Point2 = quadratic ? [pen[0] + (2 / 3) * (packed[k + 1]! - pen[0]), pen[1] + (2 / 3) * (packed[k + 2]! - pen[1])] : [packed[k + 1]!, packed[k + 2]!];
            const c2: Point2 = quadratic ? [end[0] + (2 / 3) * (packed[k + 1]! - end[0]), end[1] + (2 / 3) * (packed[k + 2]! - end[1])] : [packed[k + 3]!, packed[k + 4]!];
            if (!current) open();
            current!.points.push(...bezier(pen, c1, c2, end).map(([x, y]) => map(x, y)));
            pen = end;
            k += quadratic ? 5 : 7;
          } else if (op === CLOSE_PATH) {
            if (current) current.closed = true;
            pen = start;
            current = undefined;
            k += 1;
          } else throw new Error(`Unknown PDF path operator ${op}.`);
        }
      }
    });
    const texts: VectorText[] = [];
    for (const item of (await page.getTextContent()).items) {
      const run = item as { str?: string; transform?: number[]; width?: number };
      const text = run.str?.trim();
      if (!text || !run.transform) continue;
      const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = run.transform;
      const size = Math.hypot(a, b) || Math.hypot(c, d);
      if (!(size > 0)) continue;
      const along: Point2 = [a / size, b / size];
      const up: Point2 = [c / (Math.hypot(c, d) || 1), d / (Math.hypot(c, d) || 1)];
      const width = run.width ?? 0;
      // Centre of the run: half its length along the baseline, a third of the font size above it.
      const [x, y] = toPage(e + (along[0] * width) / 2 + up[0] * size * 0.35, f + (along[1] * width) / 2 + up[1] * size * 0.35);
      texts.push({ text, x, y, angle: Math.atan2(-along[1], along[0]) || 0, size, width });
    }
    return { width: right - left, height: top - bottom, paths, texts };
  } finally {
    await task.destroy();
  }
}
