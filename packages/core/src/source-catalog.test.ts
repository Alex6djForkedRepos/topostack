import { describe, expect, it } from "vitest";
import terrainCatalog from "../../../scripts/data/terrain-sources.json";
import { rankTerrainSources, validateSurveyCatalog, validateTerrainCatalog } from "./source-catalog";

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

describe("terrain catalog contract", () => {
  it("accepts registered bare-earth terrain sources", () => {
    expect(validateTerrainCatalog(terrainCatalog).sources).toEqual(terrainCatalog.sources);
  });
  it.each([{ priority: 0 }, { priority: 1.5 }, { nativeResolutionM: 0 }, { nativeResolutionM: NaN }, { acquisitionYear: "2020" }, { kind: "dsm" }, { minZoom: -1 }, { minZoom: 16 }, { minZoom: 1.5 }, { verticalDatum: "unknown" }, { encoding: "depth-terrarium-v1" }])("rejects unsafe terrain metadata: %j", (patch) => {
    expect(() => validateTerrainCatalog({ sources: [{ ...terrainCatalog.sources[0], ...patch }] })).toThrow();
  });
});

it("ranks quality before resolution, then survey year, with stable ID ties", () => {
  const base = validateTerrainCatalog(terrainCatalog).sources[0]!;
  const sources = [
    { ...base, id: "low-v1", priority: 100, nativeResolutionM: 0.5 },
    { ...base, id: "coarse-v1", priority: 300, nativeResolutionM: 2 },
    { ...base, id: "older-v1", priority: 300, nativeResolutionM: 1, acquisitionYear: 2010 },
    { ...base, id: "b-v1", priority: 300, nativeResolutionM: 1, acquisitionYear: 2020 },
    { ...base, id: "a-v1", priority: 300, nativeResolutionM: 1, acquisitionYear: 2020 },
  ];
  expect(rankTerrainSources(sources).map((source) => source.id)).toEqual(["a-v1", "b-v1", "older-v1", "coarse-v1", "low-v1"]);
  expect(rankTerrainSources([...sources].reverse())).toEqual(rankTerrainSources(sources));
});
