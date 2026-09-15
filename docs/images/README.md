# README visuals

- `workflows.svg` reuses the layered-relief and flat-engraving diagrams from the homepage (formerly the About page), with their styles embedded for display on GitHub.
- `studio-crater-lake.png` is an actual studio screenshot of the bundled Crater Lake preview, captured in a fresh browser context at 1280 × 900 in the light theme. Attribution and preview notices remain visible.

To refresh both assets, start the normal frontend with `npm run dev:web`, then run this in a second terminal from the repository root:

```sh
node scripts/capture-readme-assets.mjs
```

The capture script uses the installed Playwright Chromium browser. If needed, install it with `npx playwright install chromium`. Set `TOPOSTACK_CAPTURE_URL` when the frontend uses a different origin. Use the normal frontend, which includes the real-data sample, rather than an end-to-end test build.

The illustration source is `apps/generator/src/app/TerrainIllustration.svelte`. Regenerate these assets when that component, the theme, or the studio layout changes, and review the results before committing.
