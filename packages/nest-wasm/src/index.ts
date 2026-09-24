/**
 * Strip packing with sparrow, compiled to WebAssembly.
 *
 * sparrow (MIT, © 2025 Jeroen Gardeyn, KU Leuven) and jagua-rs (MPL-2.0) run unmodified; see
 * THIRD_PARTY_NOTICES.md at the repository root. Coordinates are millimetres. A placement maps an
 * item's input outline onto the strip as `p' = R(rotationDeg) · p + (x, y)`.
 */
import init, { engineInfo, initSync, stripPack, type InitInput } from "../pkg/topostack_nest_wasm.js";

export interface StripItemV1 {
  /** Outer boundary as [x, y] points, open or closed, either winding. */
  outline: Array<[number, number]>;
  /** Allowed rotations in degrees. Omit for any rotation. */
  orientationsDeg?: number[];
}

export interface StripJobV1 {
  items: StripItemV1[];
  /** Usable strip height. Placed outlines lie in [0, stripWidth] × [0, stripHeight]. */
  stripHeight: number;
  /** Minimum gap between outlines. Outlines may touch the strip edge. */
  spacing?: number;
  /** How far an outline may cross the strip edge; defaults to 0.01. */
  fitTolerance?: number;
  simplifyTolerance?: number;
  timeLimitMs: number;
  /** Stop as soon as a feasible layout at most this wide is found. */
  targetWidth?: number;
  earlyTermination?: boolean;
  seed?: number;
  reportIntervalMs?: number;
}

export interface StripPlacementV1 {
  /** Index of the item in the job. */
  index: number;
  rotationDeg: number;
  x: number;
  y: number;
}

export interface StripResultV1 {
  stripWidth: number;
  density: number;
  placements: StripPlacementV1[];
}

export interface StripProgressV1 extends StripResultV1 {
  phase: "exploration" | "compression";
  elapsedMs: number;
}

export interface NestEngineInfo {
  crate: string;
  sparrowRev: string;
  jaguaVersion: string;
}

export interface NestEngine {
  readonly info: NestEngineInfo;
  /** Runs synchronously until the job's time limit or target width is reached. */
  pack(job: StripJobV1, onProgress?: (progress: StripProgressV1) => void): StripResultV1;
}

function engine(): NestEngine {
  return {
    info: JSON.parse(engineInfo()) as NestEngineInfo,
    pack(job, onProgress) {
      const report = (text: string) => onProgress?.(JSON.parse(text) as StripProgressV1);
      return JSON.parse(stripPack(JSON.stringify(job), report)) as StripResultV1;
    },
  };
}

/** Fetches and instantiates the engine, e.g. from a URL Vite emitted for the `.wasm` file. */
export async function loadNestEngine(source: InitInput | Promise<InitInput>): Promise<NestEngine> {
  await init({ module_or_path: source });
  return engine();
}

/** Instantiates the engine from bytes already in memory, as Node tests do. */
export function loadNestEngineSync(bytes: BufferSource | WebAssembly.Module): NestEngine {
  initSync({ module: bytes });
  return engine();
}
