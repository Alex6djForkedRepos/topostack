# Feedback system

## User flow

A quiet **Feedback** button is available as a tab anchored to the right edge of the standalone studio’s render viewport, and in public-page footers. Terrain source details and lake-depth controls also offer category-specific entry points. Nothing opens automatically. The narrow edge tab leaves the header free for project controls and scrolls away with the preview on small screens.

The Atomm workbench omits all feedback entry points. Its lake-depth controls and warnings open the explanation inside the existing Atomm-styled Fabrication tips dialog, rather than linking to the public guide.

Choose a bug, feature request, terrain-data report, or lake-data report; enter a summary and details. Studio users may opt into sharing coordinates, selection bounds, output settings, source resolutions, dataset identifiers, lake/survey identifiers, data availability and warning codes. The report distinguishes the current selection from the loaded preview's bounds and marks a changed selection. Synthetic and bundled previews are identified explicitly. Lake diagnostics include at most 12 records and the total count.

Diagnostics exclude the project name, location label, custom markers/lines, raw grids, URL query strings, and credentials. Users can inspect the exact report before continuing. Drafts stay in component memory when a dialog closes; navigation or reload discards them. They are not sent to the map API or analytics.

**Continue on GitHub** opens a public issue draft in `Echo-Foxtrot-Works/topostack`. GitHub login and a final submission there are required. The app never claims the issue was submitted. Screenshots and project files can be attached on GitHub. Copy report provides a fallback; reports whose encoded links exceed 7,000 characters use a title-only URL with explicit paste instructions. Clipboard denial exposes the selectable report preview.

The dialog is loaded on demand. Native modal behavior provides focus containment and Escape dismissal; closing restores focus to its entry point. A failed dialog download offers retry and a direct tracker link.

## GitHub setup and triage

No token, new backend, or deployment secret is needed. Keep repository Issues enabled. The `.github/ISSUE_TEMPLATE` files appear in GitHub's chooser once available on the default branch; app-generated issue drafts do not depend on those templates or repository labels. Blank issues remain enabled for the app's title/body handoff. The implementation follows [GitHub's issue query parameters](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue#creating-an-issue-from-a-url-query).

Triage by title prefix: `[Bug]`, `[Feature]`, `[Terrain data]`, `[Lake data]`. Check existing reports before creating duplicates; the dialog links to the tracker. Maintainers can apply existing `bug`/`enhancement` labels and optional `data-quality`, `terrain`, `lake`, `needs-investigation`, or `needs-source` labels after creating those labels in the repository.

For data reports, reproduce the bounds with fresh generation; distinguish source resolution from output smoothing, model approximations, or layer spacing. Check current coverage and any failed sources. Evaluate candidate datasets for coverage, resolution, vertical/water-level reference, license, and provisioning cost. Link the eventual data or code change to the issue, validate the reported area, and close with the result or reason no improvement is available.

Anonymous submission is a possible future extension, requiring a protected server-side GitHub integration and abuse controls. This version deliberately uses the user's GitHub identity and GitHub's submission controls.
