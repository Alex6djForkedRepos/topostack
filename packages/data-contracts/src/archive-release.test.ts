import { describe, expect, it } from "vitest";
import { parseArchiveRelease } from "./archive-release";

const sha256 = "a".repeat(64);
const objectKey = `archives/${sha256}/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.pmtiles`;
const previousObjectKey = `archives/${"b".repeat(64)}/1f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.pmtiles`;
const release = { schemaVersion: 1, logicalKey: "osm/current.pmtiles", objectKey, dataset: "protomaps-20260905", sha256, bytes: 1024, etag: '"abc"', verifiedAt: "2026-09-05T00:00:00Z" };

describe("parseArchiveRelease", () => {
  it("returns only the known fields and keeps an explicit rollback target", () => {
    expect(parseArchiveRelease({ ...release, extra: true }, release.logicalKey)).toEqual(release);
    expect(parseArchiveRelease({ ...release, previousObjectKey }, release.logicalKey).previousObjectKey).toBe(previousObjectKey);
    expect(parseArchiveRelease({ ...release, previousObjectKey: null }, release.logicalKey).previousObjectKey).toBeNull();
    expect("previousObjectKey" in parseArchiveRelease(release, release.logicalKey)).toBe(false);
  });

  it("rejects pointers whose identity, integrity, or rollback fields disagree", () => {
    const invalid: unknown[] = [
      null,
      { ...release, schemaVersion: 2 },
      { ...release, logicalKey: "lakes/current.pmtiles" },
      { ...release, sha256: "not-hex" },
      { ...release, objectKey: `archives/${"c".repeat(64)}/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b.pmtiles` },
      { ...release, dataset: " " },
      { ...release, bytes: 12 },
      { ...release, etag: "abc" },
      { ...release, verifiedAt: "yesterday" },
      { ...release, previousObjectKey: "archives/legacy.pmtiles" },
      { ...release, previousObjectKey: objectKey },
    ];
    for (const value of invalid) expect(() => parseArchiveRelease(value, release.logicalKey)).toThrow("Invalid archive release.");
  });
});
