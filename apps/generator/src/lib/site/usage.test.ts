// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackPageView, trackUsage } from "$lib/site/usage";

beforeEach(() => {
  vi.stubEnv("VITE_SITE_ENV", "production");
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  vi.stubGlobal("location", new URL("https://topostack.app/examples/crater-lake?utm_source=github&private=secret"));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
const sent = () => vi.mocked(fetch).mock.calls.map((call) => JSON.parse(call[1]?.body as string));

describe("usage privacy and attribution", () => {
  it("retains sanitized acquisition, deduplicates entry steps and distinguishes output events", () => {
    trackPageView("/examples/crater-lake");
    trackPageView("/examples/crater-lake");
    trackPageView("/studio");
    trackPageView("/studio");
    trackUsage("export_prepared", "engraving", "browser");
    expect(sent().map((event) => event.event)).toEqual(["landing_view", "studio_open", "export_prepared"]);
    expect(sent()[2]).toEqual({ event: "export_prepared", source: "github", landing: "/examples/crater-lake", device: "large", output: "engraving", delivery: "browser", campaign: "none", medium: "none" });
    expect(JSON.stringify(sent())).not.toContain("secret");
  });
  it("attributes every generated lake page to the lakes landing", () => {
    vi.stubGlobal("location", new URL("https://topostack.app/lakes/minnesota/crow-wing-county"));
    trackPageView("/lakes/minnesota/crow-wing-county");
    trackPageView("/guides/unknown");
    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toMatchObject({ event: "landing_view", landing: "/lakes" });
  });
  it("records campaign and medium from published links, collapsing unlisted values", () => {
    vi.stubGlobal("location", new URL("https://topostack.app/guides/laser-cut-topographic-map?utm_source=social&utm_medium=Forum&utm_campaign=launch"));
    trackPageView("/guides/laser-cut-topographic-map");
    expect(sent()[0]).toMatchObject({ source: "social", campaign: "launch", medium: "forum" });
    sessionStorage.clear();
    vi.stubGlobal("location", new URL("https://topostack.app/?utm_campaign=my-private-note&utm_medium=carrier-pigeon"));
    trackPageView("/");
    expect(sent()[1]).toMatchObject({ campaign: "other", medium: "other" });
    expect(JSON.stringify(sent())).not.toContain("private");
  });
  it("attributes a studio session to the script-free page that opened it", () => {
    vi.stubGlobal("location", new URL("https://topostack.app/studio?lake=mn-18-0050&bounds=1,2,3,4"));
    vi.stubGlobal("document", { ...document, referrer: "https://topostack.app/lakes/minnesota/crow-wing-county" });
    trackPageView("/studio");
    expect(sent()[0]).toMatchObject({ event: "studio_open", landing: "/lakes", source: "direct" });
    sessionStorage.clear();
    vi.stubGlobal("document", { ...document, referrer: "https://topostack.app/lake/gull-lake-cass-county-minnesota" });
    trackPageView("/studio");
    expect(sent()[1]).toMatchObject({ landing: "/lakes" });
    sessionStorage.clear();
    vi.stubGlobal("document", { ...document, referrer: "https://www.google.com/" });
    trackPageView("/studio");
    expect(sent()[2]).toMatchObject({ landing: "/studio", source: "google" });
  });
  it("keeps a session saved before campaigns were recorded", () => {
    sessionStorage.setItem("topostack-usage-session", JSON.stringify({ landing: "/guides", source: "bing", updatedAt: Date.now(), landingSeen: true, studioSeen: false }));
    trackPageView("/studio");
    expect(sent()[0]).toMatchObject({ event: "studio_open", landing: "/guides", source: "bing", campaign: "none", medium: "none" });
  });
  it("separates assistant referrers from search engines and keeps unknown hosts uncategorized", () => {
    const from = (referrer: string) => {
      sessionStorage.clear();
      vi.stubGlobal("location", new URL("https://topostack.app/"));
      vi.stubGlobal("document", { ...document, referrer });
      trackPageView("/");
      return sent().at(-1).source;
    };
    expect(from("https://www.google.com/search")).toBe("google");
    expect(from("https://gemini.google.com/app")).toBe("ai");
    expect(from("https://chatgpt.com/c/abc")).toBe("ai");
    expect(from("https://www.perplexity.ai/search")).toBe("ai");
    expect(from("https://duckduckgo.com/")).toBe("duckduckgo");
    expect(from("https://old.reddit.com/r/lasercutting")).toBe("social");
    expect(from("https://example.invalid/")).toBe("other");
  });

  it("does not collect in development or with privacy signals", () => {
    vi.stubEnv("VITE_SITE_ENV", "development");
    trackPageView("/");
    vi.stubEnv("VITE_SITE_ENV", "production");
    vi.stubGlobal("navigator", { doNotTrack: "1" });
    trackUsage("generation_started", "stack");
    vi.stubGlobal("navigator", { globalPrivacyControl: true });
    trackUsage("generation_started", "stack");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("recovers from corrupted storage and expires acquisition after inactivity", () => {
    sessionStorage.setItem("topostack-usage-session", "broken");
    trackPageView("/");
    const saved = JSON.parse(sessionStorage.getItem("topostack-usage-session")!);
    sessionStorage.setItem("topostack-usage-session", JSON.stringify({ ...saved, updatedAt: Date.now() - 31 * 60 * 1000 }));
    vi.stubGlobal("location", new URL("https://topostack.app/"));
    trackPageView("/");
    expect(sent()).toHaveLength(2);
    expect(sent()[1].source).toBe("direct");
  });
  it("never lets rejected analytics requests break the user action", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect(() => trackUsage("generation_succeeded", "stack")).not.toThrow();
    await Promise.resolve();
  });
});
