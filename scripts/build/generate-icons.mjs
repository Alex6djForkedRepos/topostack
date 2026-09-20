// Run `node scripts/build/generate-icons.mjs` after editing static/favicon.svg.
// Uses the existing Playwright Chromium installation; generated assets are committed.
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const directory = new URL("../../apps/generator/static/", import.meta.url);
const svg = await readFile(new URL("favicon.svg", directory), "utf8");
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  async function render(size, source = svg, pixels = false) {
    const data = await page.evaluate(async ({ size, source, pixels }) => {
      const image = new Image();
      image.src = `data:image/svg+xml,${encodeURIComponent(source)}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, size, size);
      if (pixels) return Array.from(context.getImageData(0, 0, size, size).data);
      return canvas.toDataURL("image/png").split(",")[1];
    }, { size, source, pixels });
    return pixels ? Buffer.from(data) : Buffer.from(data, "base64");
  }

  for (const [name, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]]) {
    await writeFile(new URL(name, directory), await render(size));
  }
  // A full-bleed background lets launchers apply their own icon shape.
  await writeFile(new URL("icon-maskable-512.png", directory), await render(512, svg.replace('rx="104"', 'rx="0"')));

  const sizes = [16, 32, 48];
  const images = [];
  for (const size of sizes) {
    // Classic bottom-up BGRA bitmaps work with older ICO readers as well as browsers.
    const rgba = await render(size, svg, true);
    const maskStride = Math.ceil(size / 32) * 4;
    const bitmap = Buffer.alloc(40 + size * size * 4 + maskStride * size);
    bitmap.writeUInt32LE(40, 0);
    bitmap.writeInt32LE(size, 4);
    bitmap.writeInt32LE(size * 2, 8); // Color bitmap plus transparency mask
    bitmap.writeUInt16LE(1, 12);
    bitmap.writeUInt16LE(32, 14);
    bitmap.writeUInt32LE(size * size * 4, 20);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const source = (y * size + x) * 4;
        const target = 40 + ((size - 1 - y) * size + x) * 4;
        bitmap[target] = rgba[source + 2];
        bitmap[target + 1] = rgba[source + 1];
        bitmap[target + 2] = rgba[source];
        bitmap[target + 3] = rgba[source + 3];
        if (rgba[source + 3] === 0) {
          const mask = 40 + size * size * 4 + (size - 1 - y) * maskStride + Math.floor(x / 8);
          bitmap[mask] |= 1 << (7 - x % 8);
        }
      }
    }
    images.push(bitmap);
  }
  const header = Buffer.alloc(6 + sizes.length * 16);
  header.writeUInt16LE(1, 2); // ICO image type
  header.writeUInt16LE(sizes.length, 4);
  let offset = header.length;
  for (const [index, size] of sizes.entries()) {
    const entry = 6 + index * 16;
    header[entry] = header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(images[index].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[index].length;
  }
  await writeFile(new URL("favicon.ico", directory), Buffer.concat([header, ...images]));
} finally {
  await browser.close();
}
