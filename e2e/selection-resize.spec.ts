import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://static-res.makextool.com/**", (route) => route.abort());
  await page.route("https://tiles.openfreemap.org/styles/**", (route) => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#2468ac" } }],
  } }));
  await page.goto("/studio");
  await page.getByRole("radio", { name: "Map", exact: true }).click();
});

test("map handles resize the cut, lock proportions, and cancel", async ({ page }) => {
  const guide = page.locator(".crop-guide");
  const handle = page.getByRole("button", { name: "Resize selection bottom right", exact: true });
  await expect(handle).toBeVisible();
  const original = (await guide.boundingBox())!;
  const readout = page.locator(".preview-readout").first();
  const initialText = await readout.textContent();
  async function drag(dx: number, dy: number, cancel = false) {
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 5 });
    if (cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
  }
  await drag(-30, -5);
  await expect(readout).not.toHaveText(initialText!);
  const free = (await guide.boundingBox())!;
  expect(free.width).toBeLessThan(original.width - 40);
  expect(Math.abs(free.width / free.height - original.width / original.height)).toBeGreaterThan(0.05);
  await page.getByRole("checkbox", { name: "Lock aspect ratio" }).check();
  await drag(-12, -2);
  const locked = (await guide.boundingBox())!;
  expect(locked.width / locked.height).toBeCloseTo(free.width / free.height, 2);
  await page.getByRole("checkbox", { name: "Lock aspect ratio" }).uncheck();
  await page.keyboard.down("Shift");
  await drag(-10, -1);
  await page.keyboard.up("Shift");
  const shifted = (await guide.boundingBox())!;
  expect(shifted.width / shifted.height).toBeCloseTo(locked.width / locked.height, 2);
  // Earlier committed resizes regenerate elevation asynchronously. Let that
  // finish before comparing the full readout across a cancelled drag.
  await expect(page.locator(".preview-stage")).toHaveAttribute("aria-busy", "false");
  const beforeCancel = await readout.textContent();
  await drag(20, 10, true);
  await expect(readout).toHaveText(beforeCancel!);
  expect((await guide.boundingBox())!.width).toBeCloseTo(shifted.width, 1);
  await page.getByRole("button", { name: "Resize selection right", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(readout).not.toHaveText(beforeCancel!);
});


test("locked corner resizing stays continuous when pointer axes oppose each other", async ({ page }) => {
  const guide = page.locator(".crop-guide");
  const handle = page.getByRole("button", { name: "Resize selection bottom right", exact: true });
  await expect(handle).toBeVisible();
  await page.getByRole("checkbox", { name: "Lock aspect ratio" }).check();
  const start = (await guide.boundingBox())!;
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - start.width * 0.1, y + start.height * 0.099);
  const before = (await guide.boundingBox())!;
  await page.mouse.move(x - start.width * 0.1, y + start.height * 0.101);
  const after = (await guide.boundingBox())!;
  expect(Math.abs(after.width - before.width)).toBeLessThan(3);
  expect(after.width / after.height).toBeCloseTo(start.width / start.height, 2);
  await page.mouse.up();
});

test("panning keeps a resized guide at the chosen screen size", async ({ page }) => {
  const guide = page.locator(".crop-guide");
  const handle = page.getByRole("button", { name: "Resize selection right", exact: true });
  await expect(handle).toBeVisible();
  await handle.focus();
  await page.keyboard.press("Shift+ArrowLeft");
  const before = (await guide.boundingBox())!;
  const canvas = (await page.locator(".maplibregl-canvas").boundingBox())!;
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width / 2 + 40, canvas.y + canvas.height / 2, { steps: 10 });
  await page.mouse.up();
  // Let MapLibre finish inertia and emit moveend.
  await page.waitForTimeout(1200);
  const after = (await guide.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width, 1);
  expect(after.height).toBeCloseTo(before.height, 1);
});
