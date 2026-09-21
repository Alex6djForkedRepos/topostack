// Fixed categories only: never send project names, coordinates, queries or user IDs.
export const USAGE_EVENTS = ["landing_view", "studio_open", "generation_started", "generation_succeeded", "generation_failed", "generation_cancelled", "export_prepared", "export_failed", "share_link_copied", "share_link_opened"] as const;
// Every public page, so a search landing on any guide is attributed to it.
// Generated pages below /lakes and /examples report "/lakes" and "/examples".
// Additions are compatible; removing a path rejects events from open tabs.
export const USAGE_LANDINGS = [
  "/", "/studio", "/guides", "/guides/laser-cut-topographic-map", "/guides/topographic-map-engraving", "/examples/crater-lake", "/privacy",
  "/attribution", "/guides/split-large-maps", "/guides/water-paint-templates", "/guides/lake-depth-data", "/guides/how-lake-depths-work",
  "/guides/studio-tour", "/guides/map-details", "/guides/custom-markers-and-paths", "/guides/settings-reference", "/guides/export-files",
  "/guides/troubleshooting", "/lakes", "/guides/custom-lake-depth-map", "/examples", "/changelog",
] as const;
// "ai" covers assistant and answer-engine referrers, which send a visitor who
// already read a description of the tool rather than a search result snippet.
export const USAGE_SOURCES = ["direct", "google", "bing", "duckduckgo", "ai", "github", "atomm", "social", "other"] as const;
export type UsageEventName = typeof USAGE_EVENTS[number];
export interface UsageEvent {
  event: UsageEventName;
  landing: typeof USAGE_LANDINGS[number];
  source: typeof USAGE_SOURCES[number];
  device: "small" | "large";
  output: "stack" | "engraving" | "none";
  delivery: "browser" | "atomm" | "none";
}

export function isUsageEvent(value: unknown): value is UsageEvent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const fields: Record<string, readonly unknown[]> = {
    event: USAGE_EVENTS, landing: USAGE_LANDINGS, source: USAGE_SOURCES,
    device: ["small", "large"], output: ["stack", "engraving", "none"], delivery: ["browser", "atomm", "none"],
  };
  return Object.keys(record).length === Object.keys(fields).length
    && Object.entries(fields).every(([key, options]) => options.includes(record[key]));
}
