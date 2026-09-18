# Website and README visuals

- `workflows.svg` reuses the homepage's layered-relief and flat-engraving diagrams, with styles embedded for GitHub.
- `studio-crater-lake.png` is a direct 1280 × 900 studio screenshot of freshly generated Crater Lake terrain using USGS lake-floor survey data. The script copies it to `apps/generator/static/images/studio-crater-lake.png` for the homepage and example page.
- `apps/generator/static/images/social-crater-lake.png` is a 1200 × 630 sharing card composed around an unaltered screenshot of the same app-rendered model. Open Graph and Twitter metadata use this card.
- `media-provenance.json` records capture time, project settings, and successful survey request URLs.

Survey coverage is incomplete: existing terrain or modeled depths fill gaps. The pictured depth scale is exaggerated. The bundled startup preview still uses modeled depths; it is not the source of these screenshots. The Atomm gallery already has survey-backed media and its own record in `atomm/media-provenance.json`.

Start the normal frontend using the deployed data API:

```sh
VITE_MAP_API_URL=https://topostack.app npm run dev:web
```

Then run from the repository root:

```sh
node scripts/capture-readme-assets.mjs
```

Set `TOPOSTACK_CAPTURE_URL` if the frontend uses a different origin. The script requires installed Playwright Chromium (`npx playwright install chromium` if needed). It restores the settings in `atomm/media-project-v3.json`, generates fresh terrain, and requires both a successful USGS survey response and the app's surveyed-data notice before saving screenshots. Public API responses are relayed through Playwright without localhost Origin/Referer headers; their data is unchanged. Use a normal frontend, not an end-to-end test build, and avoid editing app files during capture because hot reload can reset the terrain.

The captured project is 406.4 × 270.933 mm with 3.175 mm material, requested 4× terrain exaggeration, 1.75× water-depth exaggeration, and Fit lake depth enabled. Layer limits can reduce the applied terrain scale. Attribution and coverage warnings remain visible in the studio screenshot.

Regenerate after changes to the UI, theme, survey data, or `TerrainIllustration.svelte`; visually inspect both PNGs before committing. No AI-generated terrain is used.
