import { describe, expect, it } from "vitest";
import { validateSurveyCatalog } from "./source-catalog";

const source = { id: "survey-v1", name: "Survey", url: "https://example.test/source", license: "CC BY 4.0", bounds: [-10, 40, 10, 50], encoding: "depth-terrarium-v1", maxZoom: 12 };

describe("survey catalog contract", () => {
  it("preserves provider precedence and accepts both supported encodings", () => {
    const sources = [source, { ...source, id: "second-v2", encoding: "elevation-terrarium-v1" }];
    expect(validateSurveyCatalog({ sources }).sources).toEqual(sources);
  });
  it.each([
    { id: "../survey-v1" }, { id: "unversioned" }, { name: " " }, { license: "" },
    { url: "http://example.test" }, { url: "https://user:password@example.test" },
    { bounds: [1, 2, 1, 3] }, { bounds: [-181, 0, 0, 1] }, { bounds: [0, 0, 1, 90] },
    { bounds: [0, 0, NaN, 1] }, { bounds: [0, 1, 2] }, { encoding: "unknown" },
    { maxZoom: 16 }, { maxZoom: 1.5 },
  ])("rejects an unsafe or unsupported registration: %j", (patch) => {
    expect(() => validateSurveyCatalog({ sources: [{ ...source, ...patch }] })).toThrow();
  });
  it("rejects duplicate routes and malformed catalogs", () => {
    expect(() => validateSurveyCatalog({ sources: [source, source] })).toThrow("duplicate");
    for (const value of [null, {}, { sources: [null] }]) expect(() => validateSurveyCatalog(value)).toThrow();
  });
});
