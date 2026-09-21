import {
  CHANGE_TYPES, CHANGE_TYPE_LABELS, inlineTokens, parseFragment, releaseAnchor, sortEntries, validateChangelog,
  type ChangeType, type ChangelogEntry, type InlineToken,
} from "@topostack/data-contracts/changelog";
import releases from "../../../../../changelog/releases.json";
import { REPOSITORY_URL, SITE_ORIGIN } from "$lib/site/site";

// Server-only: the full history is rendered at prerender time and reaches the
// browser as page data, never as a client module.
const fragments = import.meta.glob<string>("../../../../../changelog/unreleased/*.md", { eager: true, query: "?raw", import: "default" });

export const CHANGELOG = validateChangelog(releases);

export interface ChangeGroup {
  type: ChangeType;
  label: string;
  entries: (ChangelogEntry & { tokens: InlineToken[] })[];
}
export interface ReleaseView {
  id: string;
  version: string;
  date: string;
  displayDate: string;
  groups: ChangeGroup[];
}

const DISPLAY_DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export function groupEntries(entries: readonly ChangelogEntry[]): ChangeGroup[] {
  return CHANGE_TYPES.flatMap((type) => {
    const matching = entries.filter((entry) => entry.type === type);
    return matching.length ? [{ type, label: CHANGE_TYPE_LABELS[type], entries: matching.map((entry) => ({ ...entry, tokens: inlineTokens(entry.body) })) }] : [];
  });
}

/** Pending fragments, parsed and ordered the way the release script will fold them in. */
export function unreleasedEntries(files: Record<string, string> = fragments): ChangelogEntry[] {
  return sortEntries(Object.entries(files)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([path, text]) => parseFragment(text, path.replace(/^.*\/changelog\//, "changelog/"))));
}

export function releaseViews(changelog = CHANGELOG): ReleaseView[] {
  return changelog.releases.map((release) => ({
    id: releaseAnchor(release.version),
    version: release.version,
    date: release.date,
    displayDate: DISPLAY_DATE.format(new Date(`${release.date}T00:00:00Z`)),
    groups: groupEntries(release.entries),
  }));
}

const escapeXml = (text: string): string => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

function tokenHtml(token: InlineToken): string {
  if (token.kind === "text") return escapeXml(token.text);
  if (token.kind === "code") return `<code>${escapeXml(token.text)}</code>`;
  return `<a href="${escapeXml(token.href.startsWith("/") ? SITE_ORIGIN + token.href : token.href)}">${escapeXml(token.text)}</a>`;
}

/** One release as HTML for the feed (Atom format); every token is escaped. */
export function releaseHtml(release: ReleaseView): string {
  return release.groups.map((group) => `<h3>${group.label}</h3><ul>${group.entries.map((entry) =>
    `<li><strong>${escapeXml(entry.title)}</strong>: ${entry.tokens.map(tokenHtml).join("")}` +
    `${entry.pr ? ` (<a href="${REPOSITORY_URL}/pull/${entry.pr}">#${entry.pr}</a>)` : ""}</li>`).join("")}</ul>`).join("");
}

export function atomFeed(views: readonly ReleaseView[] = releaseViews()): string {
  const updated = `${views[0]?.date ?? "2026-09-21"}T00:00:00Z`;
  const entries = views.map((release) => [
    "<entry>",
    `<title>TopoStack ${escapeXml(release.version)}</title>`,
    `<id>${SITE_ORIGIN}/changelog#${release.id}</id>`,
    `<link rel="alternate" type="text/html" href="${SITE_ORIGIN}/changelog#${release.id}"/>`,
    `<updated>${release.date}T00:00:00Z</updated>`,
    `<content type="html">${escapeXml(releaseHtml(release))}</content>`,
    "</entry>",
  ].join("")).join("");
  return '<?xml version="1.0" encoding="utf-8"?>' +
    '<feed xmlns="http://www.w3.org/2005/Atom">' +
    "<title>TopoStack changelog</title>" +
    "<subtitle>New features, improvements and fixes in the TopoStack terrain studio.</subtitle>" +
    `<id>${SITE_ORIGIN}/changelog</id>` +
    `<link rel="self" type="application/atom+xml" href="${SITE_ORIGIN}/changelog.xml"/>` +
    `<link rel="alternate" type="text/html" href="${SITE_ORIGIN}/changelog"/>` +
    `<updated>${updated}</updated>` +
    "<author><name>Echo Foxtrot Works</name></author>" +
    entries +
    "</feed>";
}
