import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FONT_CATALOG, clearRegisteredFonts, decodeFontGlyphs, isFontLoaded, missingGlyphs } from "@topostack/core";
import { FONT_SAMPLES } from "$lib/studio/font-samples";
import { FontLoadError, ensureFonts, resetFontLoads } from "$lib/domain/fonts";

const typefaces = FONT_CATALOG.filter((entry) => entry.kind !== "bitmap");
const glyphFile = (id: string) => JSON.parse(readFileSync(join(import.meta.dirname, "font-glyphs", `${id}.json`), "utf8"));

describe("curated font data", () => {
  it("ships a valid glyph file and picker sample for every typeface", () => {
    for (const { id, kind } of typefaces) {
      const data = decodeFontGlyphs(glyphFile(id));
      expect(data).toMatchObject({ id, kind });
      expect(FONT_SAMPLES[id]?.d).toMatch(/^M/);
      // Every font draws the letters, digits and punctuation a map label uses.
      const basics = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,-'/:&()"];
      expect(basics.filter((character) => !data.glyphs[character]), id).toEqual([]);
    }
  });

  it("covers Western European accents everywhere and Central European letters beyond the Hershey sets", () => {
    for (const { id } of typefaces) {
      const data = decodeFontGlyphs(glyphFile(id));
      expect(["é", "ü", "Å", "ñ", "ß", "°"].filter((character) => !data.glyphs[character]), id).toEqual([]);
      if (!id.startsWith("hershey-")) expect(["ł", "ő", "č"].filter((character) => !data.glyphs[character]), id).toEqual([]);
    }
  });
});

describe("font loading", () => {
  afterEach(() => {
    clearRegisteredFonts();
    resetFontLoads();
  });

  it("fetches each font once and registers it with the geometry engine", async () => {
    const fetcher = vi.fn(async (url: string) => glyphFile(/font-glyphs\/([\w-]+)\.json/.exec(url)![1]!));
    await Promise.all([ensureFonts(["jost", "technical"], fetcher), ensureFonts(["jost"], fetcher)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(isFontLoaded("jost")).toBe(true);
    expect(missingGlyphs("Ωé", "jost")).toEqual(["Ω"]);
    await ensureFonts(["jost"], fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("names the font when loading fails and retries on the next request", async () => {
    const failing = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(ensureFonts(["lora"], failing)).rejects.toThrow(FontLoadError);
    await expect(ensureFonts(["lora"], failing)).rejects.toThrow("Couldn't load the Lora font");
    expect(failing).toHaveBeenCalledTimes(2);
    await expect(ensureFonts(["lora"], async () => ({ ...glyphFile("lora"), version: 2 }))).rejects.toThrow(FontLoadError);
    expect(isFontLoaded("lora")).toBe(false);
  });
});
