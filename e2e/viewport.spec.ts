import { expect, test } from "@playwright/test";
import { DEFAULT_PROJECT } from "../packages/core/src/types";

for (const outputMode of ["stack", "engraving"] as const) {
for (const [widthMm, heightMm] of [[100, 200], [400, 100]] as const) {
  test(`fits and navigates a ${widthMm} × ${heightMm} ${outputMode} preview`, async ({ page }) => {
    await page.route("https://static-res.makextool.com/**", (route) => route.abort());
    await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));
    await page.goto("/studio");
    // Include legacy bounds with an aspect ratio different from this cut.
    const project = { ...DEFAULT_PROJECT, outputMode, widthMm, heightMm, location: { ...DEFAULT_PROJECT.location, bounds: { west: -122.3, east: -122, north: 43.05, south: 42.85 } } };
    await page.locator('input[type="file"]').setInputFiles({ name: "viewport.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project)) });
    await page.getByRole("radio", { name: "Map", exact: true }).click();
    const guide = page.locator(".crop-guide");
    async function expectAspect(): Promise<void> {
      await expect.poll(async () => {
        const rect = await guide.boundingBox();
        return rect ? rect.width / rect.height : 0;
      }).toBeCloseTo(widthMm / heightMm, 2);
    }
    await expectAspect();
    await page.setViewportSize({ width: 900, height: 900 });
    await expectAspect();
    await page.getByRole("button", { name: /Generate terrain/ }).click();
    await expect(page.getByText("Ready to export")).toBeVisible();
    await page.getByRole("radio", { name: outputMode === "stack" ? "Cut layers" : "Engraving", exact: true }).click();
    const viewport = page.locator("[data-svg-viewport]");
    const svg = viewport.getByRole("img");
    await expect(svg).toBeVisible();
    async function expectFitted(): Promise<void> {
      const result = await svg.evaluate((element, size) => {
        const svg = element as SVGSVGElement;
        const stage = svg.closest("[data-svg-viewport]")!.getBoundingClientRect();
        const matrix = svg.getScreenCTM()!;
        const first = new DOMPoint(-size.widthMm / 2, -size.heightMm / 2).matrixTransform(matrix);
        const last = new DOMPoint(size.widthMm / 2, size.heightMm / 2).matrixTransform(matrix);
        return { inside: first.x > stage.left && first.y > stage.top && last.x < stage.right && last.y < stage.bottom,
          offsetX: (first.x + last.x) / 2 - (stage.left + stage.width / 2),
          offsetY: (first.y + last.y) / 2 - (stage.top + stage.height / 2) };
      }, { widthMm, heightMm });
      expect(result.inside).toBe(true);
      expect(Math.abs(result.offsetX)).toBeLessThan(1);
      expect(Math.abs(result.offsetY)).toBeLessThan(1);
    }
    await expectFitted();
    await page.setViewportSize({ width: 720, height: 900 });
    await expectFitted();
    const initial = await svg.getAttribute("viewBox");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    await expect(viewport).toHaveAttribute("data-zoom", "1.50");
    await expect(viewport).toHaveAttribute("data-rendering", "sharp");
    const zoomed = await svg.getAttribute("viewBox");
    const rect = (await viewport.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width / 2 + 60, rect.y + rect.height / 2 + 40, { steps: 5 });
    await page.mouse.up();
    await expect(svg).not.toHaveAttribute("viewBox", zoomed!);
    await page.mouse.wheel(0, -200);
    await expect.poll(async () => Number(await viewport.getAttribute("data-zoom"))).toBeGreaterThan(1.5);
    await viewport.press("0");
    await expect(svg).toHaveAttribute("viewBox", initial!);
    await viewport.press("+");
    await expect(viewport).toHaveAttribute("data-rendering", "sharp");
    const beforeKeyboardPan = await svg.getAttribute("viewBox");
    await viewport.press("ArrowRight");
    await expect(svg).not.toHaveAttribute("viewBox", beforeKeyboardPan!);
    await page.getByRole("button", { name: outputMode === "stack" ? "Reset cut view" : "Reset engraving view" }).click();
    await expect(svg).toHaveAttribute("viewBox", initial!);
    await expectFitted();
    if (outputMode === "stack") {
      // Switching layers retains the shared camera.
      await viewport.press("+");
      await expect(viewport).toHaveAttribute("data-rendering", "sharp");
      const beforeLayer = await svg.getAttribute("viewBox");
      await page.locator(".layer-range").fill("0");
      await expect(svg).toHaveAttribute("viewBox", beforeLayer!);
    }
    await page.getByRole("radio", { name: "Map", exact: true }).click();
    await page.getByRole("button", { name: "Expand all" }).click();
    await page.getByRole("spinbutton", { name: "Width", exact: true }).fill(String(widthMm * 2));
    await expect.poll(async () => {
      const rect = await guide.boundingBox();
      return rect ? rect.width / rect.height : 0;
    }).toBeCloseTo(widthMm * 2 / heightMm, 2);
    await expect(page.locator(".status-line")).toContainText("Map area changed");
    await page.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByRole("button", { name: /Complete project/ })).toBeDisabled();
  });
}
}
