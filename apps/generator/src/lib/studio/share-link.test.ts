import { describe, expect, it } from "vitest";
import { deflateSync } from "fflate";
import { DEFAULT_PROJECT, MAX_CUSTOM_LINE_POINTS, MAX_MARKER_ICON_POINTS, type ProjectConfigV1 } from "@topostack/core";
import { hasShareLink, MAX_SHARE_URL_LENGTH, projectFromShareLink, ShareLinkTooLongError, shareLinkFor } from "$lib/studio/share-link";

const STUDIO = "https://topostack.app/studio?lake=Old&bounds=1,2,3,4";
const hashOf = (link: string) => new URL(link).hash;
const fragment = (bytes: Uint8Array) => `#p=1.${Buffer.from(bytes).toString("base64url")}`;

describe("share links", () => {
  it("round-trips a project through the URL fragment and drops the query string", () => {
    const project: ProjectConfigV1 = {
      ...DEFAULT_PROJECT, name: "Mount Tam", widthMm: 360, explodedPreview: 0.8,
      markers: [{ id: "m1", lat: 37.92, lon: -122.58, symbol: "star", sizeMm: 8 }],
      customLines: [{ id: "l1", kind: "trail", points: [{ lat: 37.9, lon: -122.6 }, { lat: 37.93, lon: -122.57 }] }],
    };
    const link = shareLinkFor(project, STUDIO);
    expect(link.startsWith("https://topostack.app/studio#p=1.")).toBe(true);
    expect(hasShareLink(hashOf(link))).toBe(true);
    // The exploded-view slider is preview state and resets to its default.
    expect(projectFromShareLink(hashOf(link))).toEqual({ ...project, explodedPreview: DEFAULT_PROJECT.explodedPreview });
  });

  it("keeps a default project well under the link length limit", () => {
    expect(shareLinkFor(DEFAULT_PROJECT, STUDIO).length).toBeLessThan(1_500);
  });

  it("carries uploaded marker icons, and fits a project with a full-budget icon in a link", () => {
    // 800 points of irregular outline: the most one icon may hold, and it compresses poorly.
    const outer = Array.from({ length: MAX_MARKER_ICON_POINTS }, (_, index) => {
      const angle = index / MAX_MARKER_ICON_POINTS * Math.PI * 2;
      const radius = 400 + Math.round(Math.sin(index * 12.9898) * 90);
      return [Math.round(Math.cos(angle) * radius) || 0, Math.round(Math.sin(angle) * radius) || 0];
    }).flat();
    const icon = { id: "icon-0001", name: "Detailed", shapes: [{ outer }] };
    const project: ProjectConfigV1 = { ...DEFAULT_PROJECT, markerIcons: [icon], markers: [{ id: "m1", lat: 42.94, lon: -122.1, symbol: "custom", sizeMm: 8, iconId: icon.id }] };
    const link = shareLinkFor(project, STUDIO);
    expect(link.length).toBeLessThanOrEqual(MAX_SHARE_URL_LENGTH);
    expect(projectFromShareLink(hashOf(link))).toMatchObject({ markerIcons: [icon], markers: project.markers });
  });

  it("refuses to build a link that is too long to share", () => {
    const points = Array.from({ length: MAX_CUSTOM_LINE_POINTS }, (_, index) => ({ lat: 40 + Math.sin(index * 7.1) * 0.3, lon: -105 + Math.cos(index * 3.7) * 0.3 }));
    const project = { ...DEFAULT_PROJECT, customLines: [{ id: "big", kind: "trail" as const, points }] };
    expect(() => shareLinkFor(project, STUDIO)).toThrow(ShareLinkTooLongError);
    expect(MAX_SHARE_URL_LENGTH).toBe(8_000);
  });

  it("rejects unknown versions, damaged payloads and invalid projects", () => {
    expect(() => projectFromShareLink("#p=2.abc")).toThrow(/newer or unknown/);
    expect(() => projectFromShareLink("#p=1.")).toThrow(/not valid/);
    expect(() => projectFromShareLink("#p=1.***")).toThrow(/not valid/);
    expect(() => projectFromShareLink("#p=1.A")).toThrow(/not valid/);
    expect(() => projectFromShareLink("#p=1.AAAA")).toThrow(/damaged/);
    expect(() => projectFromShareLink(fragment(deflateSync(new TextEncoder().encode("{\"schemaVersion\":2}"))))).toThrow(/v1 project/);
    const truncated = hashOf(shareLinkFor(DEFAULT_PROJECT, STUDIO)).slice(0, -12);
    expect(() => projectFromShareLink(truncated)).toThrow(/damaged/);
  });

  it("stops inflating a decompression bomb at the project size limit", () => {
    const bomb = deflateSync(new Uint8Array(10_000_000).fill(32), { level: 9 });
    const hash = fragment(bomb);
    expect(hash.length).toBeLessThan(16_000);
    expect(() => projectFromShareLink(hash)).toThrow(/too large/);
  });

  it("rejects oversized fragments before decoding", () => {
    expect(() => projectFromShareLink(`#p=1.${"A".repeat(16_001)}`)).toThrow(/not valid/);
  });
});
