import { describe, expect, it } from "vitest";
import { USAGE_CAMPAIGNS, USAGE_EVENTS, USAGE_LANDINGS, USAGE_MEDIUMS, USAGE_SOURCES, isUsageEvent } from "./usage";

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

  it("accepts campaign and medium only as a pair of known values", () => {
    for (const campaign of USAGE_CAMPAIGNS) for (const medium of USAGE_MEDIUMS) {
      expect(isUsageEvent({ ...valid, campaign, medium })).toBe(true);
    }
    expect(isUsageEvent({ ...valid, campaign: "launch" })).toBe(false);
    expect(isUsageEvent({ ...valid, medium: "forum" })).toBe(false);
    expect(isUsageEvent({ ...valid, campaign: "spring-sale", medium: "forum" })).toBe(false);
    expect(isUsageEvent({ ...valid, campaign: "launch", medium: "billboard" })).toBe(false);
    expect(isUsageEvent({ ...valid, campaign: "launch", medium: "forum", term: "maps" })).toBe(false);
  });
});
