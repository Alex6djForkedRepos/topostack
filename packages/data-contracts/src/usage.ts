// Fixed categories only: never send project names, coordinates, queries or user IDs.
export const USAGE_EVENTS = ["landing_view", "studio_open", "generation_started", "generation_succeeded", "generation_failed", "generation_cancelled", "export_prepared", "export_failed", "share_link_copied", "share_link_opened"] as const;
export const USAGE_LANDINGS = ["/", "/studio", "/guides/laser-cut-topographic-map", "/guides/topographic-map-engraving", "/examples/crater-lake", "/privacy"] as const;
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
