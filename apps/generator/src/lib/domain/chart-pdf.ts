import * as pdfjs from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * One page of a PDF depth chart, drawn as a picture for the tracer.
 *
 * Only the chart tracing view imports this, when a PDF is chosen, so pdf.js
 * never reaches the studio's first load. The page is rasterised rather than
 * read as vector paths: the maker places depths on the picture either way, and
 * one route through the tracer keeps scans and GIS exports alike.
 *
 * Nothing here needs `eval` (pdf.js 6 has none) or WebAssembly, which the
 * site's content security policy does not allow. pdf.js decodes most chart images in JavaScript; its
 * JBIG2 and JPEG 2000 decoders want WebAssembly, so a page built from those
 * images draws blank, and that is reported rather than traced.
 */

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export interface RenderedPdfPage {
  pixels: ImageData;
  /** How many pages the file has, and which one this is (1-based, clamped). */
  pages: number;
  page: number;
  /** The page drew next to nothing; `pixels` are not worth tracing. */
  blank: boolean;
}

const BLANK_PAGE = "This PDF came out blank here: its pictures are stored in a form this browser cannot read. Save the chart as a PNG or JPEG and choose that.";

/** A page with less ink than this drew nothing a chart needs. */
const MIN_INK_SHARE = 0.0005;

export async function renderPdfPage(data: Uint8Array, page: number, maxSide: number): Promise<RenderedPdfPage> {
  // pdf.js 6 no longer evaluates code; WebAssembly is turned off here because
  // the policy would refuse it, and trying first only costs time.
  const task = pdfjs.getDocument({ data, useWasm: false, disableFontFace: true, verbosity: 0 });
  let document: pdfjs.PDFDocumentProxy;
  try {
    document = await task.promise;
  } catch (cause) {
    throw new Error(cause instanceof Error && cause.name === "PasswordException" ? "This PDF is password protected. Open it, and save the chart page as a picture." : "This file could not be read as a PDF.", { cause });
  }
  try {
    const pages = document.numPages;
    const number = Math.max(1, Math.min(pages, Math.trunc(page) || 1));
    const pdfPage = await document.getPage(number);
    const natural = pdfPage.getViewport({ scale: 1 });
    // Vector charts stay sharp at any size, so the page is drawn as large as
    // the tracer takes pictures, and a small page is drawn up to it.
    const viewport = pdfPage.getViewport({ scale: maxSide / Math.max(natural.width, natural.height) });
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot read image pixels.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    // A one-page file with nothing on it has nothing else to offer; a longer
    // one may have the chart on another page, so the caller lets the maker pick.
    const blank = inkShare(pixels) < MIN_INK_SHARE;
    if (blank && pages === 1) throw new Error(BLANK_PAGE);
    return { pixels, pages, page: number, blank };
  } finally {
    await task.destroy();
  }
}

/** The share of pixels dark enough to be ink. */
function inkShare(pixels: ImageData): number {
  const { data } = pixels;
  let dark = 0;
  for (let at = 0; at < data.length; at += 16) if (data[at]! + data[at + 1]! + data[at + 2]! < 3 * 160) dark += 1;
  return dark / (data.length / 16);
}
