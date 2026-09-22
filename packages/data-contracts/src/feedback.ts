// Feedback the studio and public pages send to the Worker, which emails it to
// the maintainer. Anonymous by default: a reply address is optional, and the
// diagnostic context is an allowlisted object the reporter chose to include.
export const FEEDBACK_KINDS = ["bug", "feature", "terrain", "lake"] as const;
export type FeedbackKind = typeof FEEDBACK_KINDS[number];

export const FEEDBACK_LIMITS = { summary: 120, details: 4000, replyTo: 254, contextBytes: 12_000, bodyBytes: 20_000 } as const;

export interface FeedbackSubmission {
  kind: FeedbackKind;
  summary: string;
  details: string;
  replyTo?: string;
  context?: Record<string, unknown>;
  /** Hidden form field; people leave it empty, form-filling bots do not. */
  website?: string;
}

// Deliberately loose: the mail service validates deliverability. This only
// rejects values that could not be an address or could smuggle a header.
const EMAIL = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/;

export function isFeedbackEmail(value: string): boolean {
  return value.length <= FEEDBACK_LIMITS.replyTo && EMAIL.test(value);
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

/** Returns the submission with trimmed text, or undefined when any field is out of contract. */
export function parseFeedbackSubmission(value: unknown): FeedbackSubmission | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const allowed = new Set(["kind", "summary", "details", "replyTo", "context", "website"]);
  if (Object.keys(record).some((key) => !allowed.has(key))) return undefined;
  if (!FEEDBACK_KINDS.includes(record.kind as FeedbackKind)) return undefined;
  if (!boundedText(record.summary, FEEDBACK_LIMITS.summary) || !boundedText(record.details, FEEDBACK_LIMITS.details)) return undefined;
  if (record.website !== undefined && typeof record.website !== "string") return undefined;
  const replyTo = typeof record.replyTo === "string" ? record.replyTo.trim() : record.replyTo;
  if (replyTo !== undefined && replyTo !== "" && (typeof replyTo !== "string" || !isFeedbackEmail(replyTo))) return undefined;
  const context = record.context;
  if (context !== undefined) {
    if (!context || typeof context !== "object" || Array.isArray(context)) return undefined;
    if (new TextEncoder().encode(JSON.stringify(context)).byteLength > FEEDBACK_LIMITS.contextBytes) return undefined;
  }
  return {
    kind: record.kind as FeedbackKind,
    summary: record.summary.trim(),
    details: record.details.trim(),
    ...(replyTo ? { replyTo: replyTo as string } : {}),
    ...(context ? { context: context as Record<string, unknown> } : {}),
    ...(record.website ? { website: record.website as string } : {}),
  };
}
