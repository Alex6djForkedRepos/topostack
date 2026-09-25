import { zlibSync } from "fflate";

// Valid 256px RGB Terrarium PNG with a constant elevation of one meter.
export const terrainPng = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAADGklEQVR4nO3OQQ0AMAgAMeYc6ZNxD5pUQGffwFn9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEL9AEIf+nMHkJuMvC8AAAAASUVORK5CYII="), (char) => char.charCodeAt(0));

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) chunk[4 + index] = type.charCodeAt(index);
  chunk.set(data, 8);
  let crc = 0xffffffff;
  for (const byte of chunk.subarray(4, chunk.length - 4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
  return chunk;
}

/** A 256px Terrarium PNG whose elevation at each pixel is `elevation(column, row)`, in whole meters. */
export function elevationPng(elevation: (column: number, row: number) => number): Uint8Array<ArrayBuffer> {
  const stride = 256 * 3;
  const raw = new Uint8Array((stride + 1) * 256);
  for (let row = 0; row < 256; row += 1) {
    for (let column = 0; column < 256; column += 1) {
      const encoded = Math.round(elevation(column, row)) + 32768;
      const offset = row * (stride + 1) + 1 + column * 3;
      raw[offset] = encoded >> 8;
      raw[offset + 1] = encoded & 0xff;
    }
  }
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, 256);
  new DataView(header.buffer).setUint32(4, 256);
  header.set([8, 2, 0, 0, 0], 8);
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", header), pngChunk("IDAT", zlibSync(raw)), pngChunk("IEND", new Uint8Array())];
  const png = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { png.set(part, offset); offset += part.length; }
  return png;
}
