import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://static-res.makextool.com/**", (route) => route.abort());
  await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#2468ac" } }],
  } }));
  await page.goto("/studio");
  await page.getByRole("button", { name: "Expand all" }).click();
});

test("markers are placed by clicking the map and moved by dragging", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const place = page.getByRole("button", { name: "Place on map" });
  await place.click();
  await expect(page.getByRole("radio", { name: "Map", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Done placing" })).toHaveAttribute("aria-pressed", "true");
  const canvas = page.locator(".map-canvas canvas");
  await expect(canvas).toBeVisible();
  const box = (await page.locator(".crop-guide").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.6);
  await expect(page.locator(".marker-card")).toHaveCount(2);
  const firstLon = Number(await page.getByRole("spinbutton", { name: "Marker 1 longitude", exact: true }).inputValue());
  const secondLon = Number(await page.getByRole("spinbutton", { name: "Marker 2 longitude", exact: true }).inputValue());
  expect(secondLon).toBeGreaterThan(firstLon);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Place on map" })).toHaveAttribute("aria-pressed", "false");
  // With placement off, a click pans nothing and adds nothing.
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(page.locator(".marker-card")).toHaveCount(2);

  const marker = page.locator(".topostack-map-marker").first();
  const before = Number(await page.getByRole("spinbutton", { name: "Marker 1 latitude", exact: true }).inputValue());
  const markerBox = (await marker.boundingBox())!;
  await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(markerBox.x + markerBox.width / 2, markerBox.y + markerBox.height / 2 + 60, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.getByRole("spinbutton", { name: "Marker 1 latitude", exact: true }).inputValue())).toBeLessThan(before);
  expect(errors).toEqual([]);
});
