# Search and discovery operations

## Build and hosting policy

Set `VITE_SITE_ENV=production` **only** for the production custom-domain build.
Pass it in the shell or CI build environment, rather than an application .env file.
Omitting it defaults to non-indexable development behavior. Other accepted
values are `development` and `atomm`; unknown values fail the build.
CI sets the value explicitly per deployment and verifies generated metadata.

- Homepage, both guides, Crater Lake example and privacy page: indexable in production.
- Studio: prerendered metadata/loading shell, client-loaded editor, always noindex.
- Development and Atomm artifacts: noindex in HTML and static response headers.
- Sitemap: production pages only; non-production builds emit an empty sitemap.
- Workers.dev and preview URLs are disabled in Wrangler; custom domains remain.
- Unknown URLs return a real 404. About URLs use permanent HTTP redirects on Workers.
- The portable About refresh remains in static output for hosts that ignore _redirects.

Validate an artifact and the actual Worker response behavior:

```sh
VITE_SITE_ENV=production npm run build -w @topostack/generator
node scripts/verify-seo.mjs --environment production
node scripts/verify-seo-http.mjs https://topostack.app production
```

The HTTP check is also called by the deployment verifier. Use the development
origin and `development` argument when checking that environment. Recheck both
after any indexing or hosting change. Keep new public pages in `PUBLIC_PAGES`
and the fixed usage landing list; update verification expectations too.

## Usage measurement

The existing Cloudflare Web Analytics beacon is now permitted by CSP. It remains
configured in Cloudflare; no beacon token is embedded in this repository.

The website also POSTs fixed-category events to `/v1/events`. The Worker logs
validated events as JSON with `message: "usage_event"` and its environment.
The endpoint requires same-origin JSON, limits bodies to 1,024 bytes, rejects
unknown fields/values and uses the existing per-client rate limiter.

Filter Workers Logs for `usage_event` and production, then group by `event`,
`landing`, `source`, `device`, `output` and `delivery`. No new database,
third-party analytics subscription or user identifier is required.

Events:

| Event | Meaning |
| --- | --- |
| landing_view | First public content page in a tab session |
| studio_open | First studio entry in that tab session |
| generation_started | User starts explicit terrain generation |
| generation_succeeded | Current real-data geometry passes the fabrication export gate |
| generation_failed | Request failed or resulting data cannot be fabricated |
| generation_cancelled | Generation was aborted or superseded |
| export_prepared | Fabrication files handed to the browser download action or Atomm SDK |
| export_failed | Fabrication export was blocked or preparation failed |

Settings-only and assembly-only downloads are excluded from successful
fabrication counts. Sample previews and automatically updated geometry do not
count as successful generation. Browser save completion and physical fabrication
cannot be observed; `export_prepared` is a handoff measure, not proof that a user
saved a file or made an object.

Attribution is a fixed category derived from an allowlisted `utm_source` or the
referrer host. Unknown values become `other`. Only that category and the public
landing path are kept in tab session storage, with entry deduplication flags and
a 30-minute inactivity expiry. No coordinates, project names, raw query strings,
custom data or stable user IDs are sent. Collection honors DNT and GPC and is
best effort. It runs only on the production host (or the explicit E2E test build).

Metrics are aggregate event counts, not exact unique-user/cohort funnels.
Blocked requests, retries, spoofed public events and disabled browser storage
can affect counts. Cloudflare's operational logs retain their own request
metadata independently. Workers Logs retention depends on the account plan;
export aggregates regularly if a longer baseline is needed.

Recommended weekly measures: non-brand search impressions/clicks by landing
page, studio entries, generation success/attempts, and prepared fabrication
exports, segmented by output and acquisition source. Use Search Console for
search traffic and Cloudflare Web Analytics for visit/device context.

## Account steps after publishing

1. Open the existing Search Console property, or verify ownership of the production
   domain. DNS verification requires a token from that account; it is not inferable
   from the codebase. Submit `https://topostack.app/sitemap.xml`.
2. Inspect the homepage and new guides, their selected canonicals and index status.
   Check Cloudflare security events if the inspection fetch is blocked.
3. Verify/submit the sitemap in Bing Webmaster Tools.
4. Confirm the Cloudflare beacon script and collection request succeed in a fresh
   browser session on the deployed site.
5. Update the published Atomm listing from `atomm/listing.md`. The immutable slug
   stays `topographic-map-generator`.
6. The GitHub description, website and topics were updated during implementation.
   Its custom social preview can be uploaded through repository settings using
   the existing studio screenshot. The site itself already references that image.

The MIT license applies to project software. Source-data and dependency licenses
remain separate; preserve export attribution. Publish real project photos and
tested laser-software import walkthroughs as evidence becomes available.

## Implementation verification — September 15, 2026

- Production, development and Atomm builds passed generated SEO validation.
- Production and development response checks passed under the local Cloudflare
  runtime, including redirects, 404s, content types and indexing/security headers.
- The Atomm ZIP built and passed the full embedded-endpoint/package scan.
- Local mobile Lighthouse: SEO, accessibility, best practices and agentic browsing
  all scored 100. These are local checks, not a claim about the deployed site.
- Unit/component suites passed; 33 affected browser cases passed across Chromium,
  Firefox and WebKit, including generation-to-export events and mobile guide navigation.
- Worker coverage met all existing thresholds. Lint, type checks, the full build
  and bundle budgets passed.
- The homepage JavaScript allowance increased from 50 to 52 kB gzip for metadata
  and attribution; observed initial homepage JavaScript was 50,701 bytes gzip.
  Existing editor-startup and total-asset limits remain enforced.

Website changes have not been deployed by this task. GitHub description, website
and topic updates were applied and read back successfully. Concurrent terrain and
bathymetry work in the shared checkout was preserved.
