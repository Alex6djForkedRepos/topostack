import { DEFAULT_PROJECT } from "@topostack/core";
import { expect, test, type Page } from "@playwright/test";
import { chartPdf, chartRings, lakeArchive, lakeCentre } from "./fixtures/depth-chart";

async function openCharts(page: Page, fromMap = false, withoutSearch = false): Promise<void> {
  // Linux WebKit can capture a stale WebGL frame after buffer swaps. Preserve
  // test drawing buffers so screenshot assertions observe the current hover.
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: object) {
      return Reflect.apply(getContext, this, [type,
        type === "webgl" || type === "webgl2" ? { ...options, preserveDrawingBuffer: true } : options,
      ]);
    } as typeof getContext;
  });
  const archive = lakeArchive(withoutSearch ? DEFAULT_PROJECT.location : lakeCentre);
  await page.route("**/v1/**", async route => {
    const url = route.request().url();
    if (url.includes("/geocode")) return route.fulfill({ json: [{ place_id: "round-lake", display_name: "Round Lake, Test Region", ...lakeCentre }] });
    if (url.includes("/lake-outlines/")) return route.fulfill({ json: { schemaVersion: 1, shards: [] } });
    if (url.endsWith("/lakes.pmtiles")) {
      const range = /bytes=(\d+)-(\d+)/.exec(route.request().headers().range ?? "");
      const start = Number(range?.[1] ?? 0), end = Math.min(Number(range?.[2] ?? archive.length - 1), archive.length - 1);
      return route.fulfill({ status: 206, headers: { "content-type": "application/octet-stream", "access-control-expose-headers": "ETag, Content-Range", etag: '"test-lake"', "content-range": `bytes ${start}-${end}/${archive.length}` }, body: archive.subarray(start, end + 1) });
    }
    return route.abort();
  });
  await page.route("https://static-res.makextool.com/**", route => route.abort());
  await page.route("https://tiles.openfreemap.org/styles/**", route => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9e5da" } }],
  } }));
  await page.goto("/studio");
  await page.getByRole("radio", { name: "Custom data", exact: true }).click();
  if (!withoutSearch) {
  await page.getByRole("textbox", { name: "Search for a lake", exact: true }).fill("Round Lake");
  await page.locator(".chart-search").getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.locator(".chart-lakes")).toContainText("Round Lake");
  }
  if (fromMap) {
    const canvas = page.locator(".maplibregl-canvas");
    await expect(canvas).toBeVisible();
    // Wait for the actual GeoJSON hit target, then check hover and leave states.
    await expect(async () => {
      await page.mouse.move(0, 0);
      await canvas.hover();
      await expect(canvas).toHaveCSS("cursor", "pointer");
    }).toPass({ timeout: 15_000 });
    // Inspect a rendered fill pixel: cursor feedback alone does not prove the hover highlight renders.
    await expect.poll(async () => {
      // Capture without scrolling the map or moving the pointer.
      const clip = await canvas.boundingBox();
      if (!clip) throw new Error("Lake map missing");
      const png = (await page.screenshot({ clip })).toString("base64");
      await expect(canvas).toHaveCSS("cursor", "pointer");
      return page.evaluate(async (base64) => {
        const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode();
        const copy = document.createElement("canvas"); copy.width = image.width; copy.height = image.height;
        const context = copy.getContext("2d")!; context.drawImage(image, 0, 0);
        return context.getImageData(Math.floor(copy.width / 2), Math.floor(copy.height / 2), 1, 1).data[1];
      }, png);
    }).toBeLessThan(180);
    await page.screenshot({ path: test.info().outputPath("lake-map-hover.png") });
    await page.mouse.move(0, 0);
    await expect(canvas).not.toHaveCSS("cursor", "pointer");
    if (withoutSearch) {
      await expect(page.getByRole("textbox", { name: "Search for a lake", exact: true })).toHaveValue("");
      await expect(page.locator(".chart-chosen")).toHaveCount(0);
      await expect(page.locator(".chart-lakes")).toHaveCount(0);
    }
    await canvas.click();
  } else await page.locator(".chart-lakes").getByRole("button", { name: /Round Lake/ }).click();
  await expect(page.locator(".chart-chosen")).toContainText("Round Lake");
}

async function mark(page: Page, value: string, x: number, y: number): Promise<void> {
  const canvas = page.locator(".chart-canvas");
  await expect(canvas).toHaveAttribute("aria-busy", "false");
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Chart canvas missing");
  await canvas.hover({ position: { x: x / 360 * bounds.width, y: y / 280 * bounds.height } });
  await expect(canvas).toHaveAttribute("data-contour", /\d+/);
  if (value === "5") await page.screenshot({ path: test.info().outputPath("contour-hover.png") });
  await canvas.click({ position: { x: x / 360 * bounds.width, y: y / 280 * bounds.height } });
  const card = page.getByRole("dialog", { name: /Assign point/ });
  await expect(card.getByRole("spinbutton")).toBeFocused();
  await expect(canvas).toHaveAttribute("data-contour", /\d+/);
  const cardBounds = await card.boundingBox();
  const viewport = page.viewportSize()!;
  expect(cardBounds).not.toBeNull();
  expect(cardBounds!.x).toBeGreaterThanOrEqual(0);
  expect(cardBounds!.y).toBeGreaterThanOrEqual(0);
  expect(cardBounds!.x + cardBounds!.width).toBeLessThanOrEqual(viewport.width);
  expect(cardBounds!.y + cardBounds!.height).toBeLessThanOrEqual(viewport.height);
  if (value === "5") await page.screenshot({ path: test.info().outputPath("depth-point-wizard.png") });
  await card.getByRole("spinbutton").fill(value);
  await card.getByRole("button", { name: /Confirm/ }).click();
  await expect(card).toHaveCount(0);
}

test("traces an image in the worker, saves it, applies it, and restores the library", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openCharts(page);
  const image = await page.evaluate(rings => {
    const canvas = document.createElement("canvas"); canvas.width = 360; canvas.height = 280;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white"; context.fillRect(0, 0, 360, 280);
    context.strokeStyle = "#141414"; context.lineWidth = 2;
    for (const [rx, ry] of rings) { context.beginPath(); context.ellipse(180, 140, rx, ry, 0, 0, 2 * Math.PI); context.stroke(); }
    return canvas.toDataURL("image/png").split(",")[1]!;
  }, chartRings);
  await page.locator(".chart-upload input").setInputFiles({ name: "round-lake.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") });
  await expect(page.locator(".chart-canvas")).toBeVisible();
  await mark(page, "5", 275, 140);
  await mark(page, "10", 130, 140);
  await expect(page.locator(".chart-depth-guide").getByRole("button", { name: "Trace chart", exact: true })).toBeDisabled();
  await mark(page, "0", 320, 140);
  await page.getByRole("button", { name: "Trace chart", exact: true }).click();
  await expect(page.locator(".chart-result")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".chart-report")).toContainText("100%");
  await expect(page.getByRole("button", { name: "Keep this chart", exact: true })).toBeEnabled();
  await expect(page.locator(".depth-3d canvas")).toBeVisible();
  await page.locator(".depth-controls").getByRole("button", { name: "Rotate", exact: true }).click();
  await page.locator(".depth-controls").getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByLabel("Vertical exaggeration", { exact: true }).selectOption("10");
  await page.locator(".depth-controls").getByRole("button", { name: "Reset view", exact: true }).click();
  await page.locator(".depth-3d").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("depth-chart-result.png") });
  await page.getByRole("button", { name: "2D depth map", exact: true }).click();
  await expect(page.locator(".chart-preview")).toBeVisible();
  await expect(page.locator(".chart-preview-legend")).toContainText("Shallow");
  await page.getByRole("button", { name: "3D lake bed", exact: true }).click();
  await expect(page.locator(".depth-3d canvas")).toBeVisible();
  await page.getByRole("button", { name: "Review and save chart", exact: true }).click();
  await expect(page.locator("#chart-save-heading")).toBeFocused();
  await page.getByRole("button", { name: "Keep this chart", exact: true }).click();
  await expect(page.locator(".chart-saved")).toContainText("Round Lake depth chart");
  await page.getByRole("button", { name: "Use for Round Lake", exact: true }).click();
  await expect(page.locator(".chart-saved__state")).toContainText("Ready for Round Lake");
  await expect(page.locator(".status-line")).toContainText("regenerate terrain");
  // The transferable project file must contain both the reference and chart data.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: /^Project settings/ }).click();
  const stream = await (await downloading).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported.charts).toHaveLength(1);
  expect(exported.charts[0].lake.hylakId).toBe(900001);
  expect(exported.charts[0].grid.depthsDm.length).toBeGreaterThan(0);
  expect(exported.project.userDepthCharts["900001"].id).toBe(exported.charts[0].id);
  await page.reload();
  await page.getByRole("radio", { name: "Custom data", exact: true }).click();
  await expect(page.locator(".chart-saved")).toContainText("Round Lake depth chart");
  await expect(page.getByRole("button", { name: "Stop using", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Stop using", exact: true }).click();
  await expect(page.getByRole("button", { name: "Use for Round Lake", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("recovers from invalid uploads and a blank PDF cover, and places points at narrow widths", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openCharts(page);
  const file = page.locator(".chart-upload input");
  await file.setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("not a pdf") });
  await expect(page.getByRole("alert")).toContainText("could not be read as a PDF");
  await file.setInputFiles({ name: "round-lake.pdf", mimeType: "application/pdf", buffer: chartPdf() });
  await expect(page.getByRole("alert")).toContainText("Page 1 of this PDF is blank");
  const pageNumber = page.getByRole("spinbutton", { name: "Page, of 2", exact: true });
  await pageNumber.fill("2"); await pageNumber.press("Tab");
  await expect(page.locator(".chart-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".chart-error")).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await mark(page, "5", 275, 140);
  await mark(page, "10", 130, 140);
  await expect(page.locator(".chart-depths li")).toHaveCount(2);
  await page.getByRole("button", { name: "Undo last point" }).click();
  await expect(page.locator(".chart-depths li")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Trace chart", exact: true })).toBeDisabled();
  await mark(page, "10", 130, 140);
  await expect(page.locator(".chart-depth-guide").getByRole("button", { name: "Trace chart", exact: true })).toBeDisabled();
  await mark(page, "0", 320, 140);
  await page.getByRole("button", { name: "Trace chart", exact: true }).click();
  await expect(page.locator(".chart-result")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".chart-report")).toContainText("100%");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("depth-chart-mobile.png") });
});


test("selects a lake on the map without changing the terrain location", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openCharts(page, true);
  await expect(page.locator(".chart-lake-map__guide")).toContainText("Lake selected");
  await expect(page.locator(".chart-upload input")).toBeAttached();
  await page.screenshot({ path: testInfo.outputPath("lake-map-selected.png") });
  // Chart selection leaves the existing project's place name alone.
  await expect(page.locator(".terrain-contextbar")).toContainText("Crater Lake");
  expect(errors).toEqual([]);
});


test("discovers and highlights lakes on first open before any search or selection", async ({ page }) => {
  await openCharts(page, true, true);
  await expect(page.locator(".chart-chosen")).toContainText("Round Lake");
});
