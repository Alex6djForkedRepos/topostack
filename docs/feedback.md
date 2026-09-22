# Feedback system

## User flow

A quiet **Feedback** button is available as a tab anchored to the right edge of the standalone studio’s render viewport, and in public-page footers. Terrain source details and lake-depth controls also offer category-specific entry points. Nothing opens automatically. The narrow edge tab leaves the header free for project controls and scrolls away with the preview on small screens.

The Atomm workbench omits all feedback entry points. Its lake-depth controls and warnings open the explanation inside the existing Atomm-styled Fabrication tips dialog, rather than linking to the public guide.

Choose a bug, feature request, terrain-data report, or lake-data report; enter a summary and details. Studio users may opt into sharing coordinates, selection bounds, output settings, source resolutions, dataset identifiers, lake/survey identifiers, data availability and warning codes. The report distinguishes the current selection from the loaded preview's bounds and marks a changed selection. Synthetic and bundled previews are identified explicitly. Lake diagnostics include at most 12 records and the total count.

Diagnostics exclude the project name, location label, custom markers/lines, raw grids, URL query strings, and credentials. Users can inspect the exact report before sending. Drafts stay in component memory when a dialog closes; navigation or reload discards them. They are not sent to analytics.

**Send feedback** posts the report to the Worker's `/v1/feedback` route, which emails it to the maintainer through [Cloudflare Email Service](https://developers.cloudflare.com/email-service/). No account is needed. An optional email address becomes the message's reply-to; without one the report is anonymous. The dialog shows a confirmation only after the Worker accepts the message. If sending fails or is rate limited, the draft is kept and the dialog offers a prefilled GitHub issue and Copy report. A "Prefer a public issue?" link to GitHub stays available for people who want to track the report in the open.

The dialog is loaded on demand. Native modal behavior provides focus containment and Escape dismissal; closing restores focus to its entry point. A failed dialog download offers retry and a direct tracker link.

## Email delivery

`POST /v1/feedback` accepts the JSON shape in `@topostack/data-contracts/feedback` (kind, summary, details, optional reply-to, optional context, and a hidden `website` honeypot) up to 20 kB. It requires a same-origin browser request, like `/v1/events`. Each client may send 3 reports a minute, with a shared ceiling of 30 a minute per Cloudflare location. Honeypot submissions answer `204` and are dropped. The email is plain text: subject `[TopoStack <Type>] <summary>` (development adds the environment), then the reply address, the details, and the pretty-printed context.

Setup, once per Cloudflare account:

1. Onboard `topostack.app` in the dashboard under **Email Service → Onboard domain**. The zone must use Cloudflare DNS; onboarding adds the SPF, DKIM, DMARC and bounce MX records.
2. Add a `FEEDBACK_EMAIL_TO` secret holding the recipient address to both the `development` and `production` GitHub environments. CI synchronizes it into the Worker on deploy, and the Wrangler config lists it as required. For local development put it in `workers/map-api/.dev.vars`.
3. The sender is the `FEEDBACK_EMAIL_FROM` var (`feedback@topostack.app`); change it in `wrangler.jsonc` if another onboarded address is preferred.

Without the secret the route answers `503` and the dialog falls back to GitHub. Worker logs record `feedback_sent`, `feedback_send_failed` (with the Email Service error code, for example `E_SENDER_NOT_VERIFIED`), `feedback_unconfigured`, and `feedback_discarded`; they never include the report text or the reply address. The local Vite dev server has no `/v1` routes, so sending from `npm run dev` on port 5273 fails over to the GitHub path; exercise the route through the Worker at port 8787 or with the Worker tests.

## GitHub setup and triage

The GitHub path needs no token or secret. Keep repository Issues enabled. The `.github/ISSUE_TEMPLATE` files appear in GitHub's chooser once available on the default branch; app-generated issue drafts do not depend on those templates or repository labels. Blank issues remain enabled for the app's title/body handoff. The implementation follows [GitHub's issue query parameters](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue#creating-an-issue-from-a-url-query).

Triage by title prefix: `[Bug]`, `[Feature]`, `[Terrain data]`, `[Lake data]`. Check existing reports before creating duplicates; the dialog links to the tracker. Maintainers can apply existing `bug`/`enhancement` labels and optional `data-quality`, `terrain`, `lake`, `needs-investigation`, or `needs-source` labels after creating those labels in the repository.

For data reports, reproduce the bounds with fresh generation; distinguish source resolution from output smoothing, model approximations, or layer spacing. Check current coverage and any failed sources. Evaluate candidate datasets for coverage, resolution, vertical/water-level reference, license, and provisioning cost. Link the eventual data or code change to the issue, validate the reported area, and close with the result or reason no improvement is available.

Emailed reports carry the same type names in their subject. When one needs public tracking, open an issue from it without the reporter's email address.
