import { describe, expect, it } from "vitest";
import { deflateSync } from "fflate";
import { decodeShareFragment, hasShareFragment, MAX_SHARE_URL_LENGTH, ShareLinkTooLongError, shareUrl } from "./share-link";

const fragment = (bytes: Uint8Array) => `#p=1.${Buffer.from(bytes).toString("base64url")}`;

describe("share-link codec", () => {
  it("round-trips a value through the fragment, replacing the query string", () => {
    const value = { schemaVersion: 1, name: "Lake Tahoe", markers: [{ lat: 39.1, lon: -120.0 }] };
    const link = shareUrl(value, "https://topostack.app/studio?lake=Old#old");
    expect(link.startsWith("https://topostack.app/studio#p=1.")).toBe(true);
    expect(hasShareFragment(new URL(link).hash)).toBe(true);
    expect(decodeShareFragment(new URL(link).hash)).toEqual(value);
  });

  it("carries a query string when asked, such as the agent link's generate flag", () => {
    const link = shareUrl({ a: 1 }, "https://topostack.app/studio", "?generate=1");
    const url = new URL(link);
    expect(url.search).toBe("?generate=1");
    expect(decodeShareFragment(url.hash)).toEqual({ a: 1 });
  });

  it("refuses to build a link past the length limit", () => {
    const noisy = Array.from({ length: 4000 }, (_, index) => Math.sin(index * 12.9898).toFixed(8));
    expect(() => shareUrl(noisy, "https://topostack.app/studio")).toThrow(ShareLinkTooLongError);
    expect(MAX_SHARE_URL_LENGTH).toBe(8_000);
  });

  it("rejects unknown versions and damaged payloads", () => {
    expect(hasShareFragment("#lake=1")).toBe(false);
    expect(() => decodeShareFragment("#p=2.abc")).toThrow(/newer or unknown/);
    expect(() => decodeShareFragment("#p=1.")).toThrow(/not valid/);
    expect(() => decodeShareFragment("#p=1.***")).toThrow(/not valid/);
    expect(() => decodeShareFragment("#p=1.AAAA")).toThrow(/damaged/);
    expect(() => decodeShareFragment(fragment(deflateSync(new TextEncoder().encode("{not json"))))).toThrow(/damaged/);
  });

  it("stops inflating a decompression bomb at the project size limit", () => {
    const bomb = deflateSync(new Uint8Array(10_000_000).fill(32), { level: 9 });
    const hash = fragment(bomb);
    expect(hash.length).toBeLessThan(16_000);
    expect(() => decodeShareFragment(hash)).toThrow(/too large/);
  });

  it("rejects oversized fragments before decoding", () => {
    expect(() => decodeShareFragment(`#p=1.${"A".repeat(16_001)}`)).toThrow(/not valid/);
  });
});
