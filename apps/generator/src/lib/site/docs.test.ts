import { describe, expect, it } from "vitest";
import { DOCS_HOME, DOCS_SECTIONS, docsNeighbours, docsSection, headingId } from "$lib/site/docs";
import { PUBLIC_PAGES } from "$lib/site/seo";

describe("guides navigation", () => {
  it("places every public page except the homepage and hub in exactly one section", () => {
    const listed = DOCS_SECTIONS.flatMap((section) => section.paths);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.toSorted()).toEqual(Object.keys(PUBLIC_PAGES).filter((path) => path !== "/" && path !== DOCS_HOME).toSorted());
  });

  it("links neighbours in reading order starting from the hub", () => {
    expect(docsNeighbours(DOCS_HOME).previous).toBeUndefined();
    expect(docsNeighbours(DOCS_HOME).next?.path).toBe(DOCS_SECTIONS[0]!.paths[0]);
    const last = DOCS_SECTIONS.at(-1)!.paths.at(-1)!;
    expect(docsNeighbours(last).next).toBeUndefined();
    expect(docsNeighbours("/studio")).toEqual({});
    expect(docsSection("/guides/lake-depth-data")?.title).toBe("Lakes and depth");
  });

  it("creates unique heading anchors", () => {
    const taken = new Set(["faq"]);
    expect(headingId("FAQ", taken)).toBe("faq-2");
    expect(headingId("1. Choose & frame your landscape", taken)).toBe("1-choose-frame-your-landscape");
    expect(headingId("Zürich’s lakes", taken)).toBe("zurich-s-lakes");
    expect(headingId("???", taken)).toBe("section");
  });
});
