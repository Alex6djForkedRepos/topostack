# Data layer and cache review

Reviewed 2026-09-15 against the working repository, including the lake-survey integrations. The architecture is a sound fit: offline archive production, a bounded streaming gateway, and portable browser geometry. R2 is authoritative storage for provisioned archives and disposable cache storage for terrain/search. Those roles must remain separate.

## Findings and changes

| Finding | Resolution |
| --- | --- |
| R2 cache failures caused healthy terrain/search origins to return 500. | Shared cache helpers fall through on read failure and contain background write failures. Structured `cache_failed` logs identify the source and operation without logging searches or credentials. |
| Public terrain URLs were mutable but advertised 30-day immutable freshness. | Public responses use a one-hour revalidation policy; terrain generation explicitly revalidates HTTP cache entries, and cached tiles support ETag/304. R2 keys remain dataset-versioned. |
| PNG content type alone could admit a corrupt upstream response indefinitely. | The gateway and browser share the same bounded Terrarium decoder. Upstream tiles are validated before caching; old cache entries are validated once and marked, or replaced from upstream. |
| Archive replacement could mix a previous object's size with a new object's bytes. | Ranged R2 reads are conditional on the metadata ETag. A replacement triggers one fresh metadata/range attempt; repeated replacement returns an uncached, retryable 503. The browser requires a strong ETag, pins it for the operation, and converts PMTiles mismatches into source failure before an individual lookup can retry into a different generation. |
| Archive error responses inherited success cache headers. | All API errors use `no-store`. Missing archives, transient outages, and bad ranges cannot create long-lived failure entries. |
| Oversized streams remained open after rejection. | Bounded reads cancel rejected bodies; status/type/length rejection also releases upstream streams. |
| Provider/schema changes could reuse geocoder cache entries, and unexpected JSON could be cached as no matches. | Geocoder keys include origin and normalization version. Unexpected response envelopes return uncached 502; malformed individual results are filtered. The existing 24-hour age check remains. |
| Tile loading launched the whole selection at once and left sibling work running after failure. | A shared ordered pool limits each source to six active tile tasks, stops queued tasks and cancels active siblings after failure. Generation completion/failure also cancels remaining source work. |
| New survey registrations could silently introduce duplicate routes or unsupported formats. | Browser, gateway, and provisioning share a typed catalog validator for versioned IDs, unique routes, bounds, zoom, encodings, HTTPS provenance URLs, and attribution. Catalog order defines precedence; later surveys fill gaps. |
| Missing terrain dataset headers received a hardcoded source identity. | Missing or inconsistent terrain provenance prevents the result being marked as real. |
| `/ready` threw a generic 500 when archive storage failed. | Readiness reports 503 with per-dependency `unavailable` details; missing and unavailable are distinct. |

Existing protections retained: bounded archive ranges (16 MiB), terrain/search body limits, request deadlines, request and geocoder rate limits, per-operation PMTiles directory/header caches, ETag mismatch recovery in PMTiles, geographic/tile/feature budgets, strict project import validation, source attribution, and fabrication export gates for missing requested data. Optional survey failure retains modeled-depth fallback rather than erasing other surveys.

## Cache ownership and freshness

| Layer | Identity | Lifetime / recovery |
| --- | --- | --- |
| Browser HTTP terrain cache | API origin and tile URL | Revalidate on generation; response max-age is one hour. |
| R2 terrain cache | `terrain/<DATASET_VERSION>/terrarium/z/x/y.png` | Retained until operator cleanup; bump dataset version for source changes. Validation metadata `png-v1` marks checked entries. |
| Browser HTTP archive ranges | API origin, archive URL, range and ETag | One-hour freshness. PMTiles checks ETag consistency and reloads after mismatch. |
| Browser PMTiles internal cache | Archive instance owned by an operation | Discarded after the operation; rejected/aborted promises do not poison the next generation. |
| R2 geocoder cache | Hash of provider origin, normalization version, normalized query and limit | Enforced 24-hour maximum age. Browser TTL is the remaining freshness. |
| Browser project storage | `topostack:project:v1` in IndexedDB | User settings, not a terrain cache. Restored projects require fresh generation for export. |
| Provisioned archives | Configured R2 object keys | Authoritative data, not evictable cache. Keep source archives and provisioning receipts for rollback. |

Cache writes are best effort; source validation is mandatory. Archive reads cannot fall through to cache helpers because a missing archive has no equivalent upstream runtime source. No cross-request promise cache is introduced in the Worker. Conditional reads follow the [R2 Workers API contract](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/#conditional-operations); background writes follow [Workers lifecycle guidance](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).

The six-task limit is per source. Terrain, vector, and lake loading can overlap, so one generation can run up to 18 tile tasks in that phase. PMTiles may issue separate header/directory requests. This is a bounded scheduling policy, not a measured throughput claim.

## Adding a source

For another survey using the supported PNG encodings:

1. Add a versioned entry to `scripts/data/lake-bathymetry.json`. IDs must be unique and end in `-v<number>`. Include coverage, maximum zoom, encoding, source URL, and license. Order overlapping sources deliberately.
2. Build a PMTiles archive with matching `topostack_dataset`, `topostack_encoding`, and zoom metadata. Transparent pixels represent missing samples. Preserve datum/quality limitations in attribution.
3. Add reproducible build inputs and a small independently checked fixture. Test coverage boundaries, missing data, overlap precedence, invalid metadata, and cancellation.
4. Provision development using `scripts/provision/provision-lake-data.mjs --source=<id>` with a pinned SHA-256; retain the archive and receipt. The catalog automatically supplies its allowlisted API route, manifest entry, browser selection, and provisioning metadata checks.
5. Verify real tiles and exported attribution in development before production provisioning. New versions get new IDs. Application deployment does not provision data.

For a different capability or encoding, extend the typed source contract and decoder explicitly. Define required versus optional behavior in source requirements/export policy, validate responses at the gateway and browser boundary, and preserve actual dataset identity in the source bundle. Avoid adding provider-specific branches to geometry: adapters should normalize into the existing elevation, marking, water-area, or survey representation where possible.

## Operational improvements implemented

- Applied and read back the missing two-day `geocode/` expiry rule in **both development and production cache buckets** on 2026-09-16 UTC. Existing multipart cleanup was preserved. `scripts/provision/manage-cache-lifecycle.mjs` audits by default and applies explicitly with `--apply`; `--prod` includes both cache buckets. It rejects unrelated broad deletion rules.
- Both provisioning scripts now stage archives at unique keys under `archives/<sha256>/<uuid>.pmtiles`, download/hash the complete remote object with bounded memory, and compare its byte count and SHA-256. Staging does not change active data. `--promote` conditionally updates a small `releases/<logical-key>.json` pointer after verification and after checking the deployed gateway supports pointers. Per-bucket receipts retain the previous release before activation. The Worker validates pointers and refuses changed/missing promoted objects; legacy archive keys still work before promotion.
- Added hourly Worker probes that bypass both terrain and geocoder caches, store a status snapshot, and fail the scheduled invocation on unhealthy origins. `/v1/upstream-health` returns 503 for missing, failed, or stale results. The hourly production workflow checks probe freshness. Deploying the Worker enables the cron; no public request parameter can bypass data caches.
- Added request-local R2 read counts to gateway logs and the exposed `x-topostack-r2-reads` header. Existing structured cache-error logs remain. The benchmark reports absent telemetry explicitly for older deployments.
- Added a repeatable Chromium benchmark and daily workflow artifact covering cold/warm browser caches, data bytes, cache outcomes, main-page JS heap samples, and local decoder CPU. All six production baseline runs and the live generation/export canary passed. See [operations and measurements](data-layer-operations.md).
- Verified the signed R2 staging/readback path using a temporary 127-byte development object; full remote SHA-256 matched, no pointer was promoted, and the temporary object was deleted.

Application code, cron configuration, and workflow changes remain local until deployment. Existing archives have not been uploaded, replaced, or promoted. Already-open clients still need to reload to receive the new frontend behavior; browser responses already issued by an older deployment cannot be revoked retroactively. Retired terrain prefixes and immutable archive versions are retained intentionally for rollback and must only be removed after their release references and retention needs are reviewed.

## Validation

Regression coverage exercises cache read/write outages, corrupt legacy tiles, malformed upstream responses, streaming size rejection, ETag revalidation, concurrent archive replacement, bounded retries, readiness failures, source registration, tile concurrency/cancellation, and missing terrain provenance. Validation passed: 119 core tests, 96 generator tests, 34 component tests, and 60 Worker tests; all configured coverage thresholds; lint and typechecking; production builds including the Worker deployment dry run; and frontend size budgets. The provisioning runtime also loaded all seven survey registrations through the shared validator. This review does not establish live provider availability, deployment health, or production performance; the live and Playwright browser suites were not run.

The operations follow-up added 68 passing Worker tests (including prior coverage) and nine passing provisioning/lifecycle regression tests. See [current validation and rollout state](data-layer-operations.md#verification-of-this-change) for the live checks and concurrent workspace budget limitation.
