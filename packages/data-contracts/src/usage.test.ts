import { describe, expect, it } from "vitest";
import { USAGE_EVENTS, USAGE_LANDINGS, USAGE_SOURCES, isUsageEvent } from "./usage";

const valid = { event: "studio_open", landing: "/studio", source: "direct", device: "large", output: "none", delivery: "browser" };

describe("isUsageEvent", () => {
  it("accepts every combination of the fixed categories", () => {
    for (const event of USAGE_EVENTS) for (const landing of USAGE_LANDINGS) for (const source of USAGE_SOURCES) {
      expect(isUsageEvent({ ...valid, event, landing, source })).toBe(true);
    }
  });

  it("rejects non-objects, unknown categories, and extra or missing fields", () => {
    expect(isUsageEvent(null)).toBe(false);
    expect(isUsageEvent("studio_open")).toBe(false);
    expect(isUsageEvent([valid])).toBe(false);
    expect(isUsageEvent({ ...valid, event: "project_named" })).toBe(false);
    expect(isUsageEvent({ ...valid, landing: "/guides/unknown" })).toBe(false);
    expect(isUsageEvent({ ...valid, projectName: "Crater Lake" })).toBe(false);
    const { delivery: _delivery, ...missing } = valid;
    expect(isUsageEvent(missing)).toBe(false);
  });
});
