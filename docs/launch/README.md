# Launch kit

This folder holds what the maintainer needs to introduce TopoStack to the people who would use it: where to post, what to say, which pictures to use, and how to tell afterwards whether any of it worked. It turns item 7 of the [SEO discoverability audit](../reports/seo-discoverability-audit-2026-09-15.md#7-finish-repository-and-platform-discovery-surfaces) into steps: share a project, the steps to reproduce it and the relevant guide with maker communities and tutorial creators, and measure visits and completed exports from each source.

Nothing in this folder has been posted anywhere. Every post is a draft for the maintainer to check, adjust and send by hand.

| File | What it is for |
| --- | --- |
| [channels.md](channels.md) | Each venue: who reads it, its self-promotion rules (and whether they were verified), the angle that fits, and the link to use |
| [posts.md](posts.md) | Ready-to-paste titles and bodies for each channel |
| [creator-pitch.md](creator-pitch.md) | A short email or DM for tutorial creators, and what to attach |
| [media.md](media.md) | Which existing images and videos suit which channel, their honest captions, and a shot list for real build photos |

## Ground rules

- **Say that the pictures are renders.** There are no photos of a finished physical piece yet. Every image and video in the repository is a screenshot or a render from the studio. Each post says so in plain words, and none may suggest a physical build. Three older Atomm covers are AI-edited "workshop" images that look like photographs; [media.md](media.md#do-not-use) lists them, and they must not be used.
- **Only cite numbers the repository supports.** For example, 8,147 lakes in [the lake depth directory](../../apps/generator/static/data/lake-depth-directory.json) (updated 2026-09-24) supports "more than 8,000 lakes". A post must not claim user counts, cut counts or compatibility with a laser program nobody has tested. The repository records one master-SVG import into xTool Studio (for the v5 Atomm media) and Atomm Open in Studio validation. It records nothing for LightBurn, the Glowforge app or Inkscape, so posts can describe the SVG format and ask for import reports, but must not promise compatibility.
- **Disclose that you built it,** in the first line of every post.
- **Ask for feedback, never for upvotes.** Hacker News and Product Hunt both say so explicitly, and on Reddit, asking for votes is vote manipulation.
- **Post one venue at a time** and stay in the thread for the first few hours to answer questions.

## Sequencing

1. **Ship the measurement and sharing work first.** Merge and promote to production:
   - #118: records `utm_campaign` and `utm_medium`, and attributes studio visits that start from lake pages;
   - #119: puts a "Made with TopoStack" credit in exported SVGs and READMEs;
   - #120: adds a system share sheet for designs;
   - #117: turns the README into a storefront, because Show HN readers will open the repository.

   Until #118 is live on `topostack.app`, campaign and medium are not recorded and a launch cannot be told apart from ordinary social traffic. Usage events are only collected on the production host.
2. **Soft launch on maker communities, one venue every few days.** Suggested order: r/lasercutting, then the LightBurn forum, r/xToolOfficial or the xTool community, r/glowforge and the Glowforge forum. Wait at least three days between venues. Venues that share a UTM combination can only be told apart by date, so spacing the posts is also what keeps the numbers readable. Fix whatever the first threads turn up before moving on.
3. **Data and mapping communities.** r/gis and r/cartography, with the data-pipeline angle. Watch lake-page traffic (landing `/lakes`) in particular.
4. **Creator outreach.** Start in parallel with step 2, once a few forum threads show which parts people ask about. Use [creator-pitch.md](creator-pitch.md). Send a handful at a time, not a mass mailing.
5. **Show HN, after per-lake pages ship.** Per-lake pages (`/lake/*`, already anticipated by #118's attribution) give Hacker News readers something concrete to open for their own lake. Post on a weekday morning (US Eastern time) when you can stay in the thread all day.
6. **Product Hunt, last.** It needs gallery images cropped to its format ([media.md](media.md#product-hunt-gallery)), a first comment and a free day. Ideally real build photos exist by then.

X, Bluesky and Mastodon posts can go out alongside any step. They are low-stakes and use their own UTM medium.

## Link scheme

Every `topostack.app` link in this kit carries three UTM parameters from fixed allowlists. Any other value is recorded as `other` and a missing one as `none`, so a typo quietly loses the attribution. Check links before pasting.

| Placement | `utm_source` | `utm_medium` | `utm_campaign` |
| --- | --- | --- | --- |
| Reddit, Hacker News, Glowforge / LightBurn / xTool forums | `social` | `forum` | `launch` |
| X, Bluesky, Mastodon, Facebook groups, Instagram | `social` | `social` | `launch` |
| Product Hunt | `other` | `referral` | `launch` |
| Creator emails and DMs | `other` | `email` | `creator` |
| Links a creator puts in a video description | `social` | `video` | `creator` |
| Atomm listing text | `atomm` | `referral` | `atomm` |
| GitHub README (handled by #117) | `github` | `referral` | `readme` |

Allowed values: `utm_source` is `direct, google, bing, duckduckgo, ai, github, atomm, social, other`; `utm_campaign` is `none, launch, readme, newsletter, creator, atomm, other`; `utm_medium` is `none, social, forum, email, video, referral, other`. Links to github.com or atomm.com carry no UTMs, because only `topostack.app` pages record them.

## Weekly measurement routine

Do this every Monday during the launch, and keep one row per week in a spreadsheet so the baseline stays visible. It follows the "following 30 days" step of the audit and the [usage measurement notes](../seo-operations.md#usage-measurement).

1. **Search Console** (`https://topostack.app` property):
   - Sitemaps report for `https://topostack.app/sitemap.xml`: submitted vs indexed count, and any errors. If per-lake pages get their own sitemap, check each one separately.
   - Pages report, filtered by prefix (`/guides/`, `/examples/`, `/lakes/`, later `/lake/`): indexed vs "Discovered / Crawled – currently not indexed".
   - Performance for the last 7 days: impressions, clicks and CTR by page, and the top non-brand queries (exclude "topostack").
2. **Workers Logs** (production Worker `topostack`): filter `message = "usage_event"` and `environment = production`, then:
   - count by `event`, grouped by `source`, `campaign` and `medium`;
   - for `campaign = launch`, the ratio of `studio_open` → `generation_succeeded` → `export_prepared`, split by `output` (`stack` / `engraving`) and `device`;
   - `landing` for launch sessions, to see which linked page actually converted.

   Workers Logs retention depends on the plan, so copy the weekly aggregates out.
3. **Cloudflare Web Analytics:** top referrers for the week. This is the only place individual subreddits or forums show up by name, and even then only when the browser sends a referrer.
4. **Feedback and issues:** the Feedback inbox and new GitHub issues. Tag anything that came from a launch thread.
5. **Write down** what was posted that week, where, and when. Without that log the numbers cannot be matched to posts.

Remember what these counts are: aggregate events, not unique users. `export_prepared` means files were handed to the browser, not that anything was cut (see [seo-operations.md](../seo-operations.md#usage-measurement)). Visitors with DNT or GPC enabled are not counted.

## Checklist

Before the first post:

- [ ] #118 (campaign/medium attribution) merged and live on production; a test visit with `?utm_source=social&utm_medium=forum&utm_campaign=launch` shows up in Workers Logs with those values
- [ ] #119 (export credit) merged and live; spot-check the credit line in LightBurn / xTool Studio / Inkscape
- [ ] #120 (share sheet) merged and live; checked on iOS Safari and Android Chrome
- [ ] #117 (README storefront) merged; GitHub social preview uploaded; Discussions enabled if wanted
- [ ] Studio generates and exports cleanly on production for Crater Lake and one example project
- [ ] Baseline week recorded (Search Console + Workers Logs) before any post
- [ ] Subreddit rules and forum categories re-read for each venue ([channels.md](channels.md) lists what was not verified)

Soft launch:

- [ ] r/lasercutting
- [ ] LightBurn forum
- [ ] r/xToolOfficial or the xTool community (confirm which is active)
- [ ] r/glowforge
- [ ] Glowforge community forum
- [ ] r/gis
- [ ] r/cartography
- [ ] X / Bluesky / Mastodon
- [ ] First 5 creator pitches sent; replies logged

Later:

- [ ] Per-lake pages shipped and in the sitemap
- [ ] Show HN posted; stayed in the thread
- [ ] First real build photographed ([shot list](media.md#shot-list-for-real-builds)); media captions updated
- [ ] Product Hunt gallery prepared; launched
- [ ] r/woodworking and r/MapPorn only with a real build photo, if their rules allow

Every week:

- [ ] Weekly measurement row filled in
- [ ] Post log updated
- [ ] Questions from threads turned into guide fixes or issues
