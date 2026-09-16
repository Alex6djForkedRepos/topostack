# Data operations and measured baseline

## Cache cleanup

The missing `geocode/` expiry rule was applied and verified in both `topostack-map-cache-development` and `topostack-map-cache` on 2026-09-16 UTC. Only geocoder objects older than 172800 seconds are affected. Cloudflare may delete them asynchronously; the application still enforces a 24-hour freshness limit. The previous multipart-abort rule was preserved.

```sh
# Read-only audit; nonzero exit if the rule is missing.
node --env-file=.env scripts/manage-cache-lifecycle.mjs --prod
# Explicit reconciliation; writes a backup of previous rules to /tmp first.
node --env-file=.env scripts/manage-cache-lifecycle.mjs --prod --apply
```

Do not apply these rules to the vector-data buckets. Do not delete retired terrain datasets or archive versions while a rollback or release pointer may need them. The tool deliberately offers no broad terrain/archive deletion mode.

## Staging and promotion

```sh
# Stage in development and fully verify the remote object without activation.
node --env-file=.env scripts/provision-vector-data.mjs ./current.pmtiles \
  --provision --expected-sha256=<pinned-sha256>

# Stage and activate a registered survey in development, after gateway deployment.
node --env-file=.env scripts/provision-lake-data.mjs ./survey.pmtiles \
  --source=usgs-crater-lake-v1 --provision --promote --expected-sha256=<pinned-sha256>
```

`--prod` includes both development and production. `--skip-digest-check` is development-only; even in that mode the locally computed SHA-256 must match the complete remote readback before promotion. Do not use staging as a substitute for review of the dataset's provenance and metadata.

The upload destination is unique per attempt: `archives/<sha256>/<uuid>.pmtiles`. Verification reads every byte back, streams it into a hash, requires the expected byte count, and records the resulting strong ETag. It does not treat a multipart ETag or client-supplied metadata as a SHA-256 proof. The readback has a two-hour deadline and uses bounded memory; large archives incur an additional full read.

Activation updates `releases/<logical-key>.json` using `If-Match` against the previous pointer, or `If-None-Match: *` for first activation. A failed upload, size/hash mismatch, or concurrent activation cannot overwrite the active pointer. If the activation request has an ambiguous network failure, inspect the current pointer before retrying. Every verified bucket gets a receipt before activation containing the previous release and a second checkpoint after acknowledged activation. Multiple buckets are not a distributed transaction: a production failure can leave development promoted, with its receipt retained.

The deployed gateway's manifest must advertise `capabilities.archiveReleases: 1` before `--promote` proceeds. Deploy the gateway first; old gateways do not understand release pointers. Existing legacy archives are untouched and remain the fallback only when no pointer exists. A corrupt pointer or altered promoted object fails closed instead of silently serving a different dataset.

For rollback, retain the receipt and referenced immutable objects. Restore the previous verified pointer using an ETag-conditioned R2/S3 update after checking its target size and ETag. For the first migration, the legacy object is retained; to roll back without racing another release, re-stage the retained original archive using its pinned digest and conditionally promote it as a verified release. No automatic archive cleanup runs.

## Monitoring and benchmarks

Worker cron probes run hourly at minute 7 after deployment, calling the real terrain/geocoder origins without cache reads or data-cache writes. A status snapshot contains only source names, HTTP status, elapsed time, and health. `/v1/upstream-health` serves it without caching; missing, failed, and older-than-two-hour snapshots return 503. The production monitor runs at minute 17 and checks this endpoint. Initial rollout requires the first cron invocation before this check can succeed.

Request completion logs include R2 read/write counters; `x-topostack-r2-reads` exposes foreground reads for benchmark attribution. Background write completion remains observable through `cache_failed` logs. The probe itself fails on upstream errors so Cloudflare scheduled-invocation monitoring also records failure.

```sh
npm ci
npx playwright install chromium
PUBLIC_APP_URL=https://topostack.echofoxtrot.works npm run data:benchmark
# Optional single case: crater-lake, dense-seattle, or large-cascades.
DATA_BENCHMARK_CASE=crater-lake PUBLIC_APP_URL=http://localhost:5273 npm run data:benchmark
```

The daily production browser workflow saves benchmark JSON for 30 days and fails if a generation cannot export. `DATA_BENCHMARK_OUTPUT` overrides the output path. Cold/warm refer to the browser cache, not forced deletion of shared R2 data. Main-page heap samples exclude GPU and geometry-worker allocations; local Node decoder CPU is not a production Worker CPU measurement.

Production baseline, collected 2026-09-16 UTC before deploying these changes:

| Selection | Cold browser | Warm browser | Cold transfer | Warm transfer |
| --- | ---: | ---: | ---: | ---: |
| Crater Lake relief | 7.61 s | 5.40 s | 825 KB | 31 KB |
| Dense Seattle engraving | 1.61 s | 0.40 s | 557 KB | 0 KB |
| Large Cascades engraving | 2.62 s | 2.42 s | 1,585 KB | 0 KB |

All six generations became export-ready; the separate live browser canary downloaded and validated a fabrication package. Observed main-page JS heap peaks ranged from 16.6 to 26.5 MB. Local PNG decoding averaged 4.90 ms of CPU per tile over 100 iterations. The deployed gateway did not yet expose R2 read counts, and all returned cache labels were HIT; these results establish neither origin-miss latency nor production Worker CPU limits. Repeat after deployment and use Cloudflare invocation metrics for Worker CPU and cache-failure rates.

The signed remote-verification path was also tested with a temporary 127-byte object in development. Its complete SHA-256 and size matched, no release was activated, and the temporary object was deleted. This proves the signing/readback path, not a full production archive migration.

## Verification of this change

The updated Worker passed 68 tests and its coverage thresholds; provisioning/lifecycle scripts passed nine regression tests. Lint, TypeScript checks, generated binding checks, and the complete production build passed. The signed staging/readback integration and production generation/export canary passed.

An isolated snapshot containing the data-layer changes passed all frontend budgets (823,333 bytes total gzipped JS; 29,642 bytes gzipped CSS). The shared workspace also contains concurrent UI additions: its full build succeeded, but the budget check reported 828,194 bytes JS against 825,000 and 30,516 bytes CSS against 30,000. Those UI changes were preserved.
