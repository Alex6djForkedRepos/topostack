// What a vector chart page is made of, in page units with the origin at the
// top-left and y down, like image pixels, so georeferencing treats a PDF page
// and a scanned image the same way.

import type { Point2 } from "./local-frame.ts";

export interface VectorPath {
  /** "#rrggbb", or undefined when the path is only filled. */
  stroke?: string;
  fill?: string;
  lineWidth: number;
  dashed: boolean;
  points: Point2[];
  closed: boolean;
}

export interface VectorText {
  text: string;
  /** Centre of the text run. */
  x: number;
  y: number;
  /** Reading direction in radians, y down (clockwise from +x). */
  angle: number;
  /** Font size and run length in page units. */
  size: number;
  width: number;
}

export interface VectorPage {
  width: number;
  height: number;
  paths: VectorPath[];
  texts: VectorText[];
}
