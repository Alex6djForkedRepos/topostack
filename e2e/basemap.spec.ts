import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

for (const output of ["Layered relief", "Flat engraving"]) {
  test(`renders basemap data in ${output} under the production security policy`, async ({ page }) => {
    // Vite preview does not serve the deployment's _headers file. Apply its
    // finalized CSP so the real bundled map worker runs under production rules.
    const headers = await readFile("apps/generator/dist/_headers", "utf8");
    // The local preview uses HTTP; WebKit otherwise upgrades loopback assets
    // to HTTPS. Keep all script, worker, and connection restrictions intact.
    const policy = headers.match(/Content-Security-Policy: (.+)/)?.[1].replace(/; upgrade-insecure-requests/, "");
    expect(policy).toBeTruthy();
    await page.route("http://127.0.0.1:4173/studio", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy! } });
    });
    await page.route("https://static-res.makextool.com/**", (route) => route.abort());
    await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({ json: {
      version: 8,
      sources: {
        terrain: {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [[[-130, 35], [-110, 35], [-110, 50], [-130, 50], [-130, 35]]] },
          },
        },
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#ffffff" } },
        { id: "terrain", type: "fill", source: "terrain", paint: { "fill-color": "#2468ac" } },
      ],
    } }));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/studio");
    await page.getByRole("radio", { name: output, exact: true }).click();
    await page.getByRole("radio", { name: "Map", exact: true }).click();
    const canvas = page.locator(".maplibregl-canvas");
    await expect(canvas).toBeVisible();
    // A canvas or background alone can render even when the worker is missing.
    // Check pixels from a GeoJSON fill that requires successful worker processing.
    await expect.poll(async () => {
      const png = (await canvas.screenshot()).toString("base64");
      return page.evaluate(async (base64) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const copy = document.createElement("canvas");
        copy.width = image.width;
        copy.height = image.height;
        const context = copy.getContext("2d")!;
        context.drawImage(image, 0, 0);
        return [...context.getImageData(Math.floor(copy.width / 2) + 40, Math.floor(copy.height / 2) + 40, 1, 1).data];
      }, png);
    }, { timeout: 15_000 }).toEqual([36, 104, 172, 255]);
    await expect(page.getByRole("radio", { name: "Map", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".preview-notice")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
