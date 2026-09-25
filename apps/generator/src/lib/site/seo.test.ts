import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { USAGE_LANDINGS } from "@topostack/data-contracts/usage";
import { LAKE_REGIONS, lakeRegionCard } from "$lib/site/lake-pages";
import { DEFAULT_SOCIAL_IMAGE, PUBLIC_PAGES, headline, isArticlePage, pageSeo, socialImage } from "$lib/site/seo";

const entries = Object.entries(PUBLIC_PAGES);

describe("public page metadata", () => {
  it("records a usable publication and modification date for every page", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const [path, meta] of entries) {
      for (const date of [meta.published, meta.updated]) {
        expect(date, path).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(date).toISOString().slice(0, 10), path).toBe(date);
        // A page cannot be modified in the future; that would poison lastmod.
        expect(date.localeCompare(today), `${path} is dated after today`).toBeLessThanOrEqual(0);
      }
      expect(meta.published.localeCompare(meta.updated), `${path} was updated before it was published`).toBeLessThanOrEqual(0);
    }
  });

  it("gives every page a sharing card with declared dimensions", () => {
    for (const [path] of entries) {
      const image = socialImage(path);
      expect(image.url, path).toMatch(/^\/images\//);
      expect(image.width, path).toBeGreaterThanOrEqual(1200);
      expect(image.height, path).toBeGreaterThanOrEqual(630);
      expect(image.alt.length, path).toBeGreaterThan(20);
    }
    expect(socialImage("/")).toBe(DEFAULT_SOCIAL_IMAGE);
    expect(socialImage("/guides/split-large-maps")).not.toBe(DEFAULT_SOCIAL_IMAGE);
  });

  it("treats guides and examples as dated articles but not hubs or policies", () => {
    expect(isArticlePage("/guides/troubleshooting")).toBe(true);
    expect(isArticlePage("/examples/crater-lake")).toBe(true);
    expect(isArticlePage("/guides")).toBe(false);
    expect(isArticlePage("/")).toBe(false);
    expect(isArticlePage("/privacy")).toBe(false);
    expect(isArticlePage("/attribution")).toBe(false);
  });

  it("derives an article headline from the page title", () => {
    expect(headline("Studio Settings Reference | TopoStack")).toBe("Studio Settings Reference");
    expect(headline("TopoStack")).toBe("TopoStack");
    for (const [path, meta] of entries) {
      expect(headline(meta.title).length, path).toBeGreaterThan(0);
      expect(headline(meta.title), path).not.toContain("| TopoStack");
    }
  });

  it("attributes a visit landing on any public page to that page", () => {
    for (const [path] of entries) expect(USAGE_LANDINGS as readonly string[], path).toContain(path);
  });

  it("resolves head metadata for registered pages and the studio only", () => {
    expect(pageSeo("/guides/troubleshooting")).toMatchObject({ registered: true, canonical: "https://topostack.app/guides/troubleshooting", article: { headline: "Troubleshooting Topographic Map Exports" } });
    expect(pageSeo("/guides/troubleshooting")!.breadcrumbs.map((crumb) => crumb.name)).toEqual(["TopoStack", "Guides", "Troubleshooting"]);
    expect(pageSeo("/")).toMatchObject({ registered: true, breadcrumbs: [] });
    expect(pageSeo("/")!.article).toBeUndefined();
    expect(pageSeo("/studio")).toMatchObject({ registered: false, breadcrumbs: [] });
    expect(pageSeo("/missing")).toBeUndefined();
  });
});

const staticDir = new URL("../../../static/", import.meta.url);
const cardsDir = new URL("images/cards/", staticDir);

/** Pixel size from a baseline or progressive JPEG's start-of-frame segment. */
function jpegSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.readUInt16BE(0)).toBe(0xffd8);
  for (let offset = 2; offset < bytes.length;) {
    const marker = bytes.readUInt16BE(offset);
    if (marker === 0xffc0 || marker === 0xffc2) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  throw new Error("JPEG has no start-of-frame segment");
}

describe("sharing cards", () => {
  it("ships every declared card at its declared size", () => {
    for (const [path] of entries) {
      const image = socialImage(path);
      expect(existsSync(new URL(image.url.slice(1), staticDir)), `${path}: ${image.url}`).toBe(true);
    }
    const regionCards = LAKE_REGIONS.map((region) => lakeRegionCard(region.slug));
    for (const card of [...entries.map(([path]) => socialImage(path)), ...regionCards].filter((image) => image.url.startsWith("/images/cards/"))) {
      const bytes = readFileSync(new URL(card.url.slice(1), staticDir));
      expect(jpegSize(bytes), card.url).toEqual({ width: card.width, height: card.height });
      // Link previews fetch the card on every share; keep it light.
      expect(bytes.byteLength, card.url).toBeLessThanOrEqual(150_000);
    }
  });

  it("gives every guide, hub and lake region its own card and leaves no stray files", () => {
    const own = entries.filter(([path]) => path.startsWith("/guides") || path === "/lakes" || path === "/examples");
    for (const [path] of own) expect(socialImage(path), path).not.toBe(DEFAULT_SOCIAL_IMAGE);
    const urls = [...entries.map(([path]) => socialImage(path).url), ...LAKE_REGIONS.map((region) => lakeRegionCard(region.slug).url)];
    const cards = urls.filter((url) => url.startsWith("/images/cards/"));
    expect(new Set(cards).size, "a card is shared between pages").toBe(cards.length);
    expect(readdirSync(cardsDir).map((file) => `/images/cards/${file}`).sort()).toEqual([...cards].sort());
  });
});
