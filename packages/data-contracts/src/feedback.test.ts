import { describe, expect, it } from "vitest";
import { FEEDBACK_KINDS, FEEDBACK_LIMITS, isFeedbackEmail, parseFeedbackSubmission } from "./feedback";

const valid = { kind: "bug", summary: "  Preview froze ", details: " Steps to reproduce\n1. Open the studio " };

describe("parseFeedbackSubmission", () => {
  it("accepts every kind and trims text", () => {
    for (const kind of FEEDBACK_KINDS) {
      expect(parseFeedbackSubmission({ ...valid, kind })).toEqual({ kind, summary: "Preview froze", details: "Steps to reproduce\n1. Open the studio" });
    }
  });

  it("keeps an optional reply address, context and honeypot value", () => {
    expect(parseFeedbackSubmission({ ...valid, replyTo: " maker@example.com ", context: { lakeCount: 2 }, website: "spam" }))
      .toMatchObject({ replyTo: "maker@example.com", context: { lakeCount: 2 }, website: "spam" });
    expect(parseFeedbackSubmission({ ...valid, replyTo: "" })).not.toHaveProperty("replyTo");
  });

  it.each([
    null, [], "bug", {},
    { ...valid, kind: "other" },
    { ...valid, summary: "   " },
    { ...valid, summary: "x".repeat(FEEDBACK_LIMITS.summary + 1) },
    { ...valid, details: "x".repeat(FEEDBACK_LIMITS.details + 1) },
    { ...valid, replyTo: "not an address" },
    { ...valid, replyTo: "a@b.com\r\nBcc: victim@example.com" },
    { ...valid, replyTo: 5 },
    { ...valid, context: [] },
    { ...valid, context: { blob: "x".repeat(FEEDBACK_LIMITS.contextBytes) } },
    { ...valid, website: 1 },
    { ...valid, to: "someone@example.com" },
  ])("rejects out-of-contract input: %j", (payload) => {
    expect(parseFeedbackSubmission(payload)).toBeUndefined();
  });
});

describe("isFeedbackEmail", () => {
  it("accepts ordinary addresses and rejects header-like values", () => {
    expect(isFeedbackEmail("first.last+tag@sub.example.org")).toBe(true);
    expect(isFeedbackEmail("Name <a@b.com>")).toBe(false);
    expect(isFeedbackEmail("a@b")).toBe(false);
    expect(isFeedbackEmail(`${"a".repeat(250)}@b.com`)).toBe(false);
  });
});
