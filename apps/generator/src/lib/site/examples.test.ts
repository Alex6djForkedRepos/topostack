import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_EXAMPLES, EXAMPLES, exampleBounds, exampleImage, exampleMeta, examplePageSeo, exampleProject } from "$lib/site/examples";
import { parseProject } from "$lib/storage/storage";

const staticFile = (path: string) => new URL(`../../../static/${path}`, import.meta.url);
// The capture script builds every example on this template project.
const template = JSON.parse(readFileSync(new URL("../../../../../atomm/media-project-v3.json", import.meta.url), "utf8"));

describe("example projects", () => {
  it("publishes every example that is not a draft, each with a unique slug", () => {
    expect(new Set(ALL_EXAMPLES.map((example) => example.slug)).size).toBe(ALL_EXAMPLES.length);
    expect(EXAMPLES.every((example) => !example.draft)).toBe(true);
    expect(ALL_EXAMPLES.filter((example) => example.draft).map((example) => example.slug)).toEqual(["lake-tahoe"]);
  });

  it("ships a captured render, sharing card and importable project for each published example", () => {
    for (const example of EXAMPLES) {
      for (const image of [`images/examples/${example.slug}.webp`, `images/examples/${example.slug}-800.webp`, exampleImage(example).url.slice(1)]) {
        expect(existsSync(staticFile(image)), image).toBe(true);
      }
      const file = JSON.parse(readFileSync(staticFile(`examples/${example.slug}.json`), "utf8"));
      expect(file.capture.layers, example.slug).toBeGreaterThan(3);
      expect(file.capture.image.width, example.slug).toBeGreaterThan(600);
      // The download must import in the studio with the settings the page describes.
      const imported = parseProject(file.project);
      expect(imported, example.slug).toMatchObject({ widthMm: example.widthMm, heightMm: example.heightMm, cropShape: example.shape, verticalExaggeration: example.verticalExaggeration, outputMode: "stack" });
      expect(file.project, `${example.slug} project is stale; re-run the capture`).toEqual(exampleProject(template, example));
    }
  });

  it("frames the ground area to the cut's aspect ratio", () => {
    for (const example of ALL_EXAMPLES) {
      const { west, south, east, north } = exampleBounds(example);
      const widthKm = (east - west) * 111.32 * Math.cos(example.center.lat * Math.PI / 180);
      const heightKm = (north - south) * 110.574;
      expect(widthKm, example.slug).toBeCloseTo(example.groundWidthKm, 6);
      expect(widthKm / heightKm, example.slug).toBeCloseTo(example.widthMm / example.heightMm, 6);
    }
  });

  it("gives each page distinct search metadata and article breadcrumbs", () => {
    const titles = EXAMPLES.map((example) => exampleMeta(example).title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const example of EXAMPLES) {
      const seo = examplePageSeo(example);
      expect(seo.title).toMatch(/ \| TopoStack$/);
      expect(seo.description.length).toBeLessThanOrEqual(170);
      expect(seo.breadcrumbs.map((crumb) => crumb.name)).toEqual(["TopoStack", "Examples", example.place]);
      expect(seo.article?.headline).not.toContain("TopoStack");
    }
  });
});
