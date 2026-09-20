// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackPageView, trackUsage } from "./usage";

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
    expect(sent()[2]).toEqual({ event: "export_prepared", source: "github", landing: "/examples/crater-lake", device: "large", output: "engraving", delivery: "browser" });
    expect(JSON.stringify(sent())).not.toContain("secret");
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
