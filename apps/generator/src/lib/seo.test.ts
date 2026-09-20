import { describe, expect, it } from "vitest";
import { DEFAULT_SOCIAL_IMAGE, PUBLIC_PAGES, headline, isArticlePage, socialImage } from "./seo";

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
});
