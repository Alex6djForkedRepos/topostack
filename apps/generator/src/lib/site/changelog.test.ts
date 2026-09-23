import { describe, expect, it } from "vitest";
import latest from "../../../../../changelog/latest.json";
import { CHANGELOG, atomFeed, groupEntries, releaseHtml, releaseViews, unreleasedEntries } from "$lib/site/changelog.server";
import { PUBLIC_PAGES } from "$lib/site/seo";

describe("changelog data", () => {
  // The release script's verify step checks the newest release against the package version.
  it("agrees with latest.json and is never dated in the future", () => {
    expect(latest).toEqual({ version: CHANGELOG.releases[0]?.version, date: CHANGELOG.releases[0]?.date });
    const today = new Date().toISOString().slice(0, 10);
    for (const release of CHANGELOG.releases) expect(release.date <= today, release.version).toBe(true);
  });

  it("dates the page by its newest release", () => {
    const meta = PUBLIC_PAGES["/changelog"]!;
    expect(meta.updated >= latest.date || meta.updated === meta.published).toBe(true);
    expect(meta.updated >= meta.published).toBe(true);
  });

  it("parses every pending fragment", () => {
    for (const entry of unreleasedEntries()) expect(entry.title.length).toBeGreaterThan(0);
    expect(unreleasedEntries({ "../../changelog/unreleased/b.md": "---\ntype: fix\ntitle: B\n---\nBody.", "../../changelog/unreleased/a.md": "---\ntype: feature\ntitle: A\n---\nBody." })
      .map((entry) => entry.title)).toEqual(["A", "B"]);
    expect(() => unreleasedEntries({ "../../changelog/unreleased/x.md": "nope" })).toThrow(/^changelog\/unreleased\/x\.md:/);
  });
});

describe("changelog views", () => {
  const entries = [
    { type: "fix" as const, title: "Fix", body: "Fixed <things>." },
    { type: "feature" as const, title: "New & shiny", body: "Read [the guide](/guides) or [docs](https://example.com), press `Ctrl+Z`, choose **Undo & redo**.", pr: 54 },
  ];

  it("groups entries by type in page order and tokenizes bodies", () => {
    const groups = groupEntries(entries);
    expect(groups.map((group) => group.label)).toEqual(["New", "Fixed"]);
    expect(groups[0]!.entries[0]!.tokens.map((token) => token.kind)).toEqual(["text", "link", "text", "link", "text", "code", "text", "strong", "text"]);
  });

  it("gives each release an anchor and a readable date", () => {
    const [view] = releaseViews({ schemaVersion: 1, releases: [{ version: "0.2.0", date: "2026-09-21", entries }] });
    expect(view).toMatchObject({ id: "v0-2-0", displayDate: "September 21, 2026" });
  });

  it("escapes feed HTML and makes site links absolute", () => {
    const [view] = releaseViews({ schemaVersion: 1, releases: [{ version: "0.2.0", date: "2026-09-21", entries }] });
    const html = releaseHtml(view!);
    expect(html).toContain("<strong>New &#38; shiny</strong>");
    expect(html).toContain('<a href="https://topostack.app/guides">the guide</a>');
    expect(html).toContain("<code>Ctrl+Z</code>");
    expect(html).toContain("<strong>Undo &#38; redo</strong>");
    expect(html).toContain("Fixed &#60;things&#62;.");
    expect(html).toContain("/pull/54");
    const feed = atomFeed([view!]);
    expect(feed).toMatch(/^<\?xml version="1\.0" encoding="utf-8"\?><feed xmlns="http:\/\/www\.w3\.org\/2005\/Atom">/);
    expect(feed).toContain("<id>https://topostack.app/changelog#v0-2-0</id>");
    expect(feed).toContain("<updated>2026-09-21T00:00:00Z</updated>");
    expect(feed).not.toContain("<strong>");
  });

  it("builds a feed entry for every release", () => {
    expect(atomFeed().match(/<entry>/g)?.length).toBe(CHANGELOG.releases.length);
  });
});
