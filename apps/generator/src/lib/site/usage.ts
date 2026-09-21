import { USAGE_LANDINGS, USAGE_SOURCES, type UsageEvent, type UsageEventName } from "@topostack/data-contracts/usage";

const STORAGE_KEY = "topostack-usage-session";
const SESSION_MS = 30 * 60 * 1000;
interface Session {
  landing: UsageEvent["landing"];
  source: UsageEvent["source"];
  updatedAt: number;
  landingSeen: boolean;
  studioSeen: boolean;
}

function enabled(): boolean {
  return import.meta.env.VITE_SITE_ENV === "production" && typeof window !== "undefined"
    && (location.hostname === "topostack.app" || (import.meta.env.MODE === "e2e" && import.meta.env.VITE_E2E === "1"))
    && navigator.doNotTrack !== "1" && !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
}
function acquisition(): UsageEvent["source"] {
  const campaign = new URL(location.href).searchParams.get("utm_source")?.toLowerCase();
  if (campaign) return USAGE_SOURCES.find((source) => source === campaign) ?? "other";
  if (!document.referrer) return "direct";
  try {
    const host = new URL(document.referrer).hostname;
    if (host === location.hostname) return "direct";
    // Assistants are matched before the search engines: gemini.google.com is a
    // Google host, but its visitors did not come from a search result page.
    if (["chatgpt.com", "openai.com", "perplexity.ai", "claude.ai", "anthropic.com", "copilot.microsoft.com", "gemini.google.com"].some((domain) => host === domain || host.endsWith("." + domain))) return "ai";
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return "google";
    if (host === "bing.com" || host.endsWith(".bing.com")) return "bing";
    if (host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) return "duckduckgo";
    if (host === "github.com" || host.endsWith(".github.com")) return "github";
    if (host === "atomm.com" || host.endsWith(".atomm.com")) return "atomm";
    if (["reddit.com", "youtube.com", "facebook.com", "instagram.com", "pinterest.com", "t.co"].some((domain) => host === domain || host.endsWith("." + domain))) return "social";
  } catch { /* Unknown referrers use the fixed fallback category. */ }
  return "other";
}
/** The fixed landing category for a path; generated lake pages share "/lakes". */
function landingOf(path: string): UsageEvent["landing"] | undefined {
  return USAGE_LANDINGS.find((landing) => landing === path) ?? (path.startsWith("/lakes/") ? "/lakes" : undefined);
}
function session(): Session {
  try {
    const saved: Session = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && USAGE_LANDINGS.includes(saved.landing) && USAGE_SOURCES.includes(saved.source)
      && Number.isFinite(saved.updatedAt) && Date.now() - saved.updatedAt < SESSION_MS && saved.updatedAt <= Date.now()
      && typeof saved.landingSeen === "boolean" && typeof saved.studioSeen === "boolean") return saved;
  } catch { /* Storage restrictions must not affect the studio. */ }
  return { landing: landingOf(location.pathname) ?? "/", source: acquisition(), updatedAt: Date.now(), landingSeen: false, studioSeen: false };
}
function send(event: UsageEventName, current: Session, output: UsageEvent["output"], delivery: UsageEvent["delivery"]): void {
  current.updatedAt = Date.now();
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* Best effort. */ }
  const payload: UsageEvent = { event, landing: current.landing, source: current.source, device: innerWidth < 768 ? "small" : "large", output, delivery };
  // Same-origin collection only. Never wait for analytics before continuing a user action.
  void fetch("/v1/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), keepalive: true, credentials: "omit", referrerPolicy: "no-referrer" }).catch(() => undefined);
}
export function trackUsage(event: UsageEventName, output: UsageEvent["output"] = "none", delivery: UsageEvent["delivery"] = "none"): void {
  if (!enabled()) return;
  send(event, session(), output, delivery);
}
export function trackPageView(path: string): void {
  if (!enabled() || !landingOf(path)) return;
  const current = session();
  if (path === "/studio") {
    if (current.studioSeen) return;
    current.studioSeen = true;
    send("studio_open", current, "none", "none");
  } else {
    if (current.landingSeen) return;
    current.landingSeen = true;
    send("landing_view", current, "none", "none");
  }
}
