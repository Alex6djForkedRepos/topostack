import { expect, test } from "@playwright/test";

test("Atomm uses the platform export hook and template layout across desktop, RTL, and narrow frames", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/v1/**", route => route.abort("internetdisconnected"));
  await page.route("https://static-res.makextool.com/**", route => route.fulfill({ contentType: "application/javascript", body: `
    window.atomm = {
      lifecycle: { on(event, hook) { window.testExport = hook; } },
      app: { getLocale: async () => 'ja', getSupportedLocales: async () => [{ code: 'en', name: 'English' }] },
      ui: { toast: async () => 'toast', closeToast: async () => {} }
    };
    const render = () => document.querySelectorAll('[data-atomm-export-button]').forEach(slot => {
      if (!slot.firstChild) { const button = document.createElement('button'); button.textContent = 'Platform Export'; slot.append(button); }
    });
    new MutationObserver(render).observe(document.documentElement, { childList: true, subtree: true }); render();
  ` }));
  await page.route("**/atomm-test", route => route.fulfill({ contentType: "text/html", body: '<html><body style="margin:0"><iframe title="Atomm generator" src="/studio" style="width:100%;height:100vh;border:0;display:block"></iframe></body></html>' }));
  await page.goto("/atomm-test");
  const studio = page.frameLocator("iframe");
  await expect(studio.locator(".atomm-workbench")).toBeVisible();
  await expect(studio.locator(".app-header")).toHaveCount(0);
  await expect(studio.locator(".feedback-trigger, .feedback-dialog")).toHaveCount(0);
  await expect(studio.locator('a[href*="/guides/how-lake-depths-work"]')).toHaveCount(0);
  await expect(studio.locator("[data-atomm-export-button]")).toHaveCount(1);
  await expect(studio.getByRole("button", { name: "Platform Export" })).toBeVisible();
  await expect(studio.locator("html")).toHaveAttribute("lang", "en");
  for (const selector of [".gen-rail-lead", ".gen-rail-params"]) {
    expect(await studio.locator(selector).evaluate(el => el.getBoundingClientRect().width)).toBe(320);
  }
  const invoke = async (intent: "download" | "openInStudio") => studio.locator("body").evaluate(async (_el, intent) => {
    type ExportFile = { filename: string; blob: Blob };
    const hook = (window as unknown as { testExport: (value: { intent: string }) => Promise<ExportFile | ExportFile[]> }).testExport;
    try {
      const output = await hook({ intent });
      const files = Array.isArray(output) ? output : [output];
      return { files: await Promise.all(files.map(async file => ({ filename: file.filename, text: file.filename.endsWith(".svg") ? await file.blob.text() : "", bytes: file.blob.size }))), error: "" };
    } catch (error) { return { files: [], error: (error as Error).message }; }
  }, intent);
  expect((await invoke("download")).error).toMatch(/real terrain/i);
  await studio.getByRole("button", { name: "Cut size", exact: true }).click();
  const width = studio.getByRole("spinbutton", { name: "Width", exact: true });
  expect(await width.evaluate(el => el.closest(".number-input")!.getBoundingClientRect().width)).toBe(92);
  expect(await width.evaluate(el => el.closest(".number-input")!.getBoundingClientRect().height)).toBe(28);
  await studio.getByRole("button", { name: "Generate terrain", exact: true }).click();
  await expect(studio.locator(".status-line")).toContainText("Real terrain ready", { timeout: 45_000 });
  const master = await invoke("openInStudio");
  expect(master.error).toBe("");
  expect(master.files).toHaveLength(1);
  expect(master.files[0]!.filename).toMatch(/-master\.svg$/);
  expect(master.files[0]!.text).toContain('stroke="#FE0002"');
  expect(master.files[0]!.text).toContain('stroke="#2366FF"');
  await expect(studio.locator(".atomm-export-footer")).toContainText("blue lines → Score; red → Cut");
  expect(await page.evaluate(svg => {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    return !doc.querySelector("parsererror") && [...doc.querySelectorAll("path")].every(path =>
      path.getAttribute("fill") === "none" && ["#2366FF", "#FE0002"].includes(path.getAttribute("stroke") ?? ""));
  }, master.files[0]!.text)).toBe(true);
  // Parameter edits must change exported geometry without another Generate.
  await studio.getByRole("button", { name: "Terrain layers", exact: true }).click();
  await studio.getByRole("spinbutton", { name: "Vertical exaggeration", exact: true }).fill("8");
  await expect.poll(async () => Number(await studio.getByRole("slider", { name: "Selected layer", exact: true }).getAttribute("max"))).toBeGreaterThan(23);
  await expect(studio.locator(".preview-stage")).toHaveAttribute("aria-busy", "false");
  const tall = await invoke("openInStudio");
  expect(tall.error).toBe("");
  expect(tall.files[0]!.text).not.toBe(master.files[0]!.text);
  expect(tall.files[0]!.text).toContain("layer-25");
  const layerCount = Number(await studio.getByRole("slider", { name: "Selected layer", exact: true }).getAttribute("max")) + 1;
  await expect(studio.locator("#section-terrain .relief-summary strong")).toContainText(`${layerCount} layers`);
  const previousLayers = await studio.locator(".layer-heading").textContent();
  await studio.getByRole("spinbutton", { name: "Vertical exaggeration", exact: true }).fill("1");
  await expect(studio.locator(".preview-stage")).toHaveAttribute("aria-busy", "false");
  await expect(studio.locator(".layer-heading")).not.toHaveText(previousLayers!);
  const exaggerated = await invoke("openInStudio");
  expect(exaggerated.error).toBe("");
  expect(exaggerated.files[0]!.text).not.toBe(master.files[0]!.text);
  await width.fill("450");
  await expect(studio.locator(".preview-stage")).toHaveAttribute("aria-busy", "false");
  const resized = await invoke("openInStudio");
  expect(resized.error).toBe("");
  expect(resized.files[0]!.text).not.toBe(exaggerated.files[0]!.text);
  await studio.getByRole("button", { name: "Map details", exact: true }).click();
  const lakeHelp = studio.locator("#section-details").getByRole("button", { name: "How lake depths work", exact: true });
  await lakeHelp.click();
  const helpDialog = studio.getByRole("dialog", { name: "Fabrication tips" });
  await expect(helpDialog.getByRole("heading", { name: "How lake depths work" })).toBeFocused();
  await expect(helpDialog).toContainText("A modeled floor is not a measured survey.");
  await expect(helpDialog.locator("a")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(lakeHelp).toBeFocused();
  await expect(studio.locator(".feedback-trigger, .feedback-dialog")).toHaveCount(0);
  await expect(studio.locator('a[href*="/guides/how-lake-depths-work"]')).toHaveCount(0);
  const stage = studio.locator(".preview-stage");
  await studio.getByRole("checkbox", { name: "Latitude and longitude grid", exact: true }).check();
  await expect(stage).toHaveAttribute("aria-busy", "false");
  const gridded = await invoke("openInStudio");
  expect(gridded.error).toBe("");
  expect(gridded.files[0]!.text).not.toBe(resized.files[0]!.text);
  await studio.getByRole("checkbox", { name: "North arrow", exact: true }).check();
  for (const label of ["North arrow design", "Engraving font"]) {
    const options = studio.getByRole("radiogroup", { name: label, exact: true });
    await options.scrollIntoViewIfNeeded();
    expect(await options.locator("button").evaluateAll(buttons => buttons.every(button => button.scrollWidth <= button.clientWidth))).toBe(true);
    expect(await options.evaluate(el => el.getBoundingClientRect().right <= el.closest(".gen-rail-params")!.getBoundingClientRect().right - 16)).toBe(true);
  }
  await studio.getByRole("radio", { name: "2D", exact: true }).click();
  expect(await studio.locator(".mode-switch").evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  expect(await studio.locator(".status-line").evaluate(el => getComputedStyle(el).whiteSpace)).toBe("normal");
  const tipsControl = studio.getByRole("button", { name: "Tips", exact: true });
  await tipsControl.hover();
  expect(await tipsControl.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(246, 246, 247)");
  const all = await invoke("download");
  expect(all.error).toBe("");
  expect(all.files.length).toBeGreaterThan(4);
  expect(all.files.every(file => !/[\\/]/.test(file.filename))).toBe(true);
  await studio.getByRole("radio", { name: "Flat engraving" }).click();
  await expect(studio.locator(".preview-stage")).toHaveAttribute("aria-busy", "false");
  const flat = await invoke("openInStudio");
  expect(flat.error).toBe("");
  expect(flat.files[0]!.filename).toMatch(/-engraving\.svg$/);
  expect(flat.files[0]!.text).not.toContain('stroke="#FE0002"');
  await studio.locator("html").evaluate(el => el.setAttribute("dir", "rtl"));
  const lead = await studio.locator(".gen-rail-lead").boundingBox();
  const params = await studio.locator(".gen-rail-params").boundingBox();
  expect(lead!.x).toBeGreaterThan(params!.x);
  expect(await studio.locator(".preview-stage").evaluate(el => getComputedStyle(el).direction)).toBe("ltr");
  await studio.getByRole("button", { name: "Tips", exact: true }).click();
  await expect(studio.getByRole("dialog", { name: "Fabrication tips" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(studio.getByRole("button", { name: "Tips", exact: true })).toBeFocused();
  await page.setViewportSize({ width: 700, height: 800 });
  await expect.poll(() => studio.locator(".gen-rail-params").evaluate(el => el.getBoundingClientRect().width)).toBe(700);
  expect(await studio.locator("body").evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const canvas = await studio.locator(".gen-canvas").boundingBox();
  expect(canvas!.y).toBe(0);
  const footer = await studio.locator(".atomm-export-footer").boundingBox();
  expect(Math.round(footer!.y + footer!.height)).toBe(800);
});


test("Atomm SDK failure explains recovery and reconnects after reload", async ({ page }) => {
  let offline = true;
  await page.route("**/v1/**", route => route.abort());
  await page.route("https://static-res.makextool.com/**", route => offline ? route.abort() : route.fulfill({ contentType: "application/javascript", body: `
    window.atomm = { lifecycle: { on() {} }, app: { getLocale: async () => 'en', getSupportedLocales: async () => [] } };
  ` }));
  await page.route("**/atomm-recovery", route => route.fulfill({ contentType: "text/html", body: '<iframe title="Generator" src="/studio" style="width:100%;height:800px"></iframe>' }));
  await page.goto("/atomm-recovery");
  const studio = page.frameLocator("iframe");
  await expect(studio.getByText("Connecting to Atomm…", { exact: true })).toBeVisible();
  const retry = studio.getByRole("button", { name: "Reload connection" });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  await expect(studio.getByText("Atomm has not connected.", { exact: false })).toBeVisible();
  offline = false;
  await retry.click();
  await expect(studio.locator(".atomm-workbench")).toBeVisible();
  await expect(retry).toHaveCount(0);
  await expect(studio.getByText("Connecting to Atomm…", { exact: true })).toHaveCount(0);
});


test("Atomm map selection tools leave view, Tips, and zoom controls accessible", async ({ page }, testInfo) => {
  await page.route("**/v1/**", route => route.abort());
  await page.route("https://tiles.openfreemap.org/styles/**", route => route.fulfill({ json: {
    version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#cbd9c3" } }],
  } }));
  await page.route("https://static-res.makextool.com/**", route => route.fulfill({ contentType: "application/javascript", body: `
    window.atomm = { lifecycle: { on() {} }, app: { getLocale: async () => 'en', getSupportedLocales: async () => [] } };
  ` }));
  await page.route("**/atomm-map", route => route.fulfill({ contentType: "text/html", body: '<html><body style="margin:0"><iframe title="Generator" src="/studio" style="width:100%;height:100vh;border:0;display:block"></iframe></body></html>' }));
  await page.goto("/atomm-map");
  const studio = page.frameLocator("iframe");
  for (const [width, height, direction] of [[1280, 900, "ltr"], [960, 600, "ltr"], [700, 800, "ltr"], [390, 700, "ltr"], [1280, 900, "rtl"]] as const) {
    await page.setViewportSize({ width, height });
    await studio.locator("html").evaluate((el, dir) => el.setAttribute("dir", dir), direction);
    await studio.getByRole("radio", { name: "Map", exact: true }).click();
    await expect(studio.locator(".map-wrap")).toBeVisible();
    await expect(studio.locator(".selection-tools")).toHaveCount(0);
    expect(await studio.locator(".map-wrap").evaluate(el => getComputedStyle(el).isolation)).toBe("isolate");
    const lock = studio.locator(".gen-rail-lead #section-setup").getByRole("checkbox", { name: "Lock aspect ratio", exact: true });
    await expect(studio.locator(".gen-rail-params").getByRole("checkbox", { name: "Lock aspect ratio" })).toHaveCount(0);
    await lock.check();
    await studio.getByRole("radio", { name: "2D", exact: true }).click();
    await studio.getByRole("radio", { name: "Map", exact: true }).click();
    await expect(lock).toBeChecked();
    if (width === 1280 && direction === "ltr") {
      const guide = studio.locator(".crop-guide");
      const ratio = () => guide.evaluate(el => el.getBoundingClientRect().width / el.getBoundingClientRect().height);
      const before = await ratio();
      const handle = studio.getByRole("button", { name: "Resize selection right", exact: true });
      await handle.focus();
      await page.keyboard.press("ArrowLeft");
      await expect.poll(ratio).toBeCloseTo(before, 2);
      await lock.uncheck();
      await handle.focus();
      await page.keyboard.press("ArrowLeft");
      await expect.poll(ratio).not.toBeCloseTo(before, 2);
    } else await lock.uncheck();
    const tips = studio.getByRole("button", { name: "Tips", exact: true });
    await tips.click();
    await expect(studio.getByRole("dialog", { name: "Fabrication tips" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tips).toBeFocused();
    await studio.getByRole("button", { name: "Zoom in", exact: true }).click();
    await studio.getByRole("button", { name: "Fit to canvas", exact: true }).click();
    await page.screenshot({ path: testInfo.outputPath(`map-controls-${width}-${direction}.png`) });
    await studio.getByRole("radio", { name: "2D", exact: true }).click();
    await expect(studio.locator(".selection-tools")).toHaveCount(0);
  }
  await studio.locator("html").evaluate(el => el.setAttribute("dir", "ltr"));
  const lead = studio.locator(".gen-rail-lead");
  const custom = lead.getByRole("button", { name: "Markers & paths", exact: true });
  await expect(studio.locator(".gen-rail-params .custom-data-section")).toHaveCount(0);
  await expect(lead.locator('.config-section + .custom-data-section')).toHaveCount(1);
  await custom.click();
  await studio.getByRole("radio", { name: "Map", exact: true }).click();
  await lead.getByRole("button", { name: "Add marker", exact: true }).click();
  await expect(studio.locator(".topostack-map-marker")).toHaveCount(1);
  await lead.getByRole("radio", { name: "Star", exact: true }).click();
  await expect(studio.locator(".topostack-map-marker")).toHaveAttribute("data-symbol", "star");
  for (const direction of ["ltr", "rtl"]) {
    await studio.locator("html").evaluate((el, dir) => el.setAttribute("dir", dir), direction);
    expect(await lead.locator(".marker-symbol-options button").evaluateAll(buttons => buttons.every(button => {
      const bounds = button.getBoundingClientRect();
      const icon = button.querySelector("svg")!.getBoundingClientRect();
      return Math.abs(icon.x + icon.width / 2 - bounds.x - bounds.width / 2) < 0.5
        && Math.abs(icon.y + icon.height / 2 - bounds.y - bounds.height / 2) < 0.5;
    }))).toBe(true);
  }
  await studio.locator("html").evaluate(el => el.setAttribute("dir", "ltr"));
  await lead.getByRole("button", { name: "Add path", exact: true }).click();
  await lead.getByRole("button", { name: "Add point", exact: true }).click();
  await expect(lead.getByRole("spinbutton", { name: "Path 1 point 3 latitude", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("left-markers-paths.png") });
  await lead.getByRole("button", { name: "Remove path 1", exact: true }).click();
  await lead.getByRole("button", { name: "Remove marker 1", exact: true }).click();
  await expect(studio.locator(".topostack-map-marker")).toHaveCount(0);
  await studio.getByRole("button", { name: "Cut size", exact: true }).click();
  await studio.getByRole("radio", { name: "Circle", exact: true }).click();
  const lock = lead.getByRole("checkbox", { name: "Lock aspect ratio", exact: true });
  await expect(lock).toBeDisabled();
  await expect(lock).toBeChecked();
  await studio.getByRole("radio", { name: "Rectangle", exact: true }).click();
  await expect(lock).toBeEnabled();
  await expect(lock).not.toBeChecked();
});


test("Atomm layer and exploded controls stay above expanded settings", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.route("**/v1/**", route => route.abort());
  await page.route("https://static-res.makextool.com/**", route => route.fulfill({ contentType: "application/javascript", body: `
    window.atomm = { lifecycle: { on() {} }, app: { getLocale: async () => 'en', getSupportedLocales: async () => [] } };
  ` }));
  await page.route("**/atomm-layers", route => route.fulfill({ contentType: "text/html", body: '<html><body style="margin:0"><iframe title="Generator" src="/studio" style="width:100%;height:100vh;border:0;display:block"></iframe></body></html>' }));
  await page.goto("/atomm-layers");
  const studio = page.frameLocator("iframe");
  const dock = studio.locator(".gen-rail-params .layer-dock");
  await expect(dock).toBeVisible();
  await expect(studio.locator(".gen-params-content > :first-child")).toHaveClass("layer-dock");
  for (const name of ["Cut size", "Terrain layers", "Map details", "Linework", "Fabrication settings"]) {
    const section = studio.getByRole("button", { name, exact: true });
    if (await section.getAttribute("aria-expanded") === "false") await section.click();
  }
  const scroller = studio.locator(".gen-rail-params .gen-rail-scroll");
  for (const direction of ["ltr", "rtl"]) {
    await studio.locator("html").evaluate((el, dir) => el.setAttribute("dir", dir), direction);
    await scroller.evaluate(el => el.scrollTop = el.scrollHeight);
    await expect.poll(() => dock.evaluate(el => {
      const card = el.getBoundingClientRect();
      const viewport = el.closest(".gen-rail-scroll")!.getBoundingClientRect();
      return card.top >= viewport.top && card.top <= viewport.top + 1 && card.bottom < viewport.bottom;
    })).toBe(true);
    const exploded = studio.getByRole("slider", { name: "Stack separation", exact: true });
    await exploded.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowUp");
    await expect(exploded).toHaveValue("0.05");
    await page.screenshot({ path: testInfo.outputPath(`pinned-layer-controls-${direction}.png`) });
  }
  const layer = studio.getByRole("slider", { name: "Selected layer", exact: true });
  await layer.focus();
  await page.keyboard.press("Home");
  await expect(studio.locator(".layer-heading")).toContainText("Layer 1");
  await expect(studio.getByRole("radio", { name: "2D", exact: true })).toHaveAttribute("aria-checked", "true");
  await studio.getByRole("radio", { name: "Flat engraving" }).click();
  await expect(dock).toHaveCount(0);
});


test("Atomm linework and location search stay readable under light and dark themes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route("**/v1/**", route => route.abort());
  await page.route("https://static-res.makextool.com/**", route => route.fulfill({ contentType: "application/javascript", body: `
    window.atomm = { lifecycle: { on() {} }, app: { getLocale: async () => 'en', getSupportedLocales: async () => [] } };
  ` }));
  await page.route("**/atomm-contrast", route => route.fulfill({ contentType: "text/html", body: '<html><body style="margin:0"><iframe title="Generator" src="/studio" style="width:100%;height:100vh;border:0;display:block"></iframe></body></html>' }));
  await page.goto("/atomm-contrast");
  const studio = page.frameLocator("iframe");
  const chooseLocation = studio.locator(".location-card");
  await expect(chooseLocation.locator("strong")).toHaveText("Choose location");
  await expect(chooseLocation.locator("small")).not.toBeEmpty();
  await expect(chooseLocation).toHaveAttribute("aria-haspopup", "dialog");
  const suggestions = studio.getByRole("group", { name: "Suggested places", exact: true });
  await expect(suggestions.getByRole("button")).toHaveCount(4);
  await expect(suggestions.locator("button svg")).toHaveCount(4);
  expect(await suggestions.locator("button").evaluateAll(buttons => buttons.every(el => el.scrollWidth <= el.clientWidth))).toBe(true);
  await studio.getByRole("button", { name: "Linework", exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await studio.locator("html").evaluate((el, value) => el.setAttribute("data-theme", value), theme);
    expect(await chooseLocation.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor }))).toEqual({ background: "rgb(255, 255, 255)", border: "rgb(61, 62, 66)" });
    for (const name of ["Fine", "Balanced", "Bold"]) {
      const preset = studio.getByRole("radio", { name, exact: true });
      await preset.click();
      await expect(preset).toHaveAttribute("aria-checked", "true");
      expect(await preset.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }))).toEqual({ background: "rgb(255, 255, 255)", color: "rgb(23, 23, 25)" });
    }
    const customize = studio.getByRole("button", { name: "Customize preset", exact: true });
    expect(await customize.evaluate(el => {
      const button = el.getBoundingClientRect();
      const presets = el.parentElement!.querySelector(".line-presets")!.getBoundingClientRect();
      return Math.abs(button.left - presets.left) < 1 && Math.abs(button.right - presets.right) < 1;
    })).toBe(true);
    await customize.click();
    await expect(customize).toHaveAttribute("aria-expanded", "true");
    await page.screenshot({ path: testInfo.outputPath(`linework-${theme}.png`) });
    await customize.click();
    await studio.locator(".location-card").click();
    const dialog = studio.getByRole("dialog", { name: "Choose anywhere", exact: true });
    const search = dialog.getByRole("textbox", { name: "Search places", exact: true });
    await search.fill("Crater");
    expect(await search.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }))).toEqual({ background: "rgb(238, 239, 241)", color: "rgb(23, 23, 25)" });
    await search.clear();
    await dialog.locator(".preset-locations summary").click();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 });
      const latitude = dialog.getByRole("spinbutton", { name: "Latitude", exact: true });
      await latitude.scrollIntoViewIfNeeded();
      const locate = dialog.getByRole("button", { name: "Use current location", exact: true });
      expect(await locate.evaluate(el => {
        const button = el.getBoundingClientRect();
        const icon = el.querySelector("svg")!.getBoundingClientRect();
        const useCoordinates = el.parentElement!.querySelector(".ldt-button:not(.ldt-icon-button)")!.getBoundingClientRect();
        return Math.abs(useCoordinates.right - el.parentElement!.getBoundingClientRect().right) < 1
          && useCoordinates.height === 40 && Math.abs(useCoordinates.top - button.top) < 1 && button.width === 40 && button.height === 40 && icon.width === 24 && icon.height === 24
          && Math.abs(icon.x + icon.width / 2 - button.x - button.width / 2) < 1
          && Math.abs(icon.y + icon.height / 2 - button.y - button.height / 2) < 1;
      })).toBe(true);
      expect(await dialog.locator(".coordinate-row").evaluate(el => {
        const row = el.getBoundingClientRect();
        const fields = [...el.querySelectorAll(".atomm-number")].map(field => field.getBoundingClientRect());
        return fields.length === 2 && Math.abs(fields[0]!.top - fields[1]!.top) < 1
          && fields.every(field => Math.abs(field.width - (row.width - 8) / 2) < 1);
      })).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`location-coordinates-${theme}-${width}.png`) });
      await dialog.locator(".preset-grid").scrollIntoViewIfNeeded();
      expect(await dialog.locator(".preset-grid .location-option").evaluateAll(buttons => buttons.every(button => {
        const style = getComputedStyle(button);
        return Number.parseFloat(style.paddingTop) >= 8 && Number.parseFloat(style.paddingLeft) >= 8
          && button.scrollWidth <= button.clientWidth;
      }))).toBe(true);
      expect(await dialog.locator(".preset-grid").evaluate(el => Number.parseFloat(getComputedStyle(el).gap))).toBeGreaterThanOrEqual(8);
      await page.screenshot({ path: testInfo.outputPath(`location-examples-${theme}-${width}.png`) });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: testInfo.outputPath(`location-search-${theme}.png`) });
    await page.keyboard.press("Escape");
  }
});

test("Atomm depth allowance is explicit and fitting actions use readable theme buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route("**/v1/**", route => route.abort("internetdisconnected"));
  await page.route("https://static-res.makextool.com/**", route => route.fulfill({ contentType: "application/javascript", body: "window.atomm = { lifecycle: { on() {} }, app: { getLocale: async () => 'en', getSupportedLocales: async () => [{ code: 'en', name: 'English' }] } };" }));
  await page.route("**/atomm-test", route => route.fulfill({ contentType: "text/html", body: '<iframe title="Atomm generator" src="/studio" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>' }));
  await page.goto("/atomm-test");
  const studio = page.frameLocator("iframe");
  await expect(studio.locator(".atomm-workbench")).toBeVisible();
  await studio.getByRole("button", { name: "Terrain layers", exact: true }).click();
  const terrainSlider = studio.getByRole("slider", { name: "Vertical exaggeration slider", exact: true });
  await expect(terrainSlider).toHaveAttribute("max", "10");
  await terrainSlider.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(studio.getByRole("spinbutton", { name: "Vertical exaggeration", exact: true })).toHaveValue("1.1");
  await studio.getByRole("spinbutton", { name: "Vertical exaggeration", exact: true }).fill("8");
  await studio.getByRole("button", { name: "Map details", exact: true }).click();
  const depthSlider = studio.getByRole("slider", { name: "Water depth exaggeration slider", exact: true });
  await expect(depthSlider).toHaveAttribute("min", "0.25");
  await expect(depthSlider).toHaveAttribute("max", "4");
  await depthSlider.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await expect(studio.getByRole("spinbutton", { name: "Water depth exaggeration", exact: true })).toHaveValue("0.3");
  const limit = studio.getByRole("checkbox", { name: "Limit depth layers", exact: true });
  await expect(limit).not.toBeChecked();
  await expect(studio.getByRole("spinbutton", { name: "Maximum depth layers", exact: true })).toHaveCount(0);
  await studio.getByRole("spinbutton", { name: "Water depth exaggeration", exact: true }).fill("4");
  await expect(studio.locator(".preview-stage")).toHaveAttribute("aria-busy", "false");
  const automaticCount = Number(await studio.getByRole("slider", { name: "Selected layer", exact: true }).getAttribute("max")) + 1;
  await limit.check();
  const depthLayers = studio.getByRole("spinbutton", { name: "Maximum depth layers", exact: true });
  await depthLayers.fill("1");
  const fit = studio.getByRole("button", { name: "Fit depth", exact: true });
  await expect(fit).toBeVisible();
  await expect(studio.locator(".preview-stage")).toHaveAttribute("aria-busy", "false");
  expect(Number(await studio.getByRole("slider", { name: "Selected layer", exact: true }).getAttribute("max")) + 1).toBeLessThan(automaticCount);
  for (const theme of ["light", "dark"]) {
    await studio.locator("html").evaluate((el, value) => el.setAttribute("data-theme", value), theme);
    for (const action of [fit, studio.getByRole("button", { name: "Use manual depth", exact: true })]) {
      await page.mouse.move(0, 0);
      const appearance = await action.evaluate(el => {
        const css = getComputedStyle(el);
        return { radius: css.borderRadius, transform: css.textTransform, border: css.borderTopWidth, height: el.getBoundingClientRect().height, color: css.color };
      });
      expect(appearance).toMatchObject({ radius: "6px", transform: "none", border: "1px", height: 32, color: "rgb(23, 23, 25)" });
      await action.click();
      await expect(studio.locator(".preview-stage")).toHaveAttribute("aria-busy", "false");
    }
  }
  await expect(studio.getByRole("checkbox", { name: "Fit lake depth to available layers", exact: true })).not.toBeChecked();
  await limit.uncheck();
  await expect(fit).toHaveCount(0);
  await expect(depthLayers).toHaveCount(0);
  await expect.poll(async () => Number(await studio.getByRole("slider", { name: "Selected layer", exact: true }).getAttribute("max")) + 1).toBe(automaticCount);
  await expect(studio.locator("#section-details")).toContainText("Automatic: adds all layers needed");
});

for (const embedded of [true, false]) {
  test(`${embedded ? "Atomm" : "Standalone"} terrain generation shows animated stage feedback and respects reduced motion`, async ({ page }) => {
    await page.route("**/v1/**", route => route.abort("internetdisconnected"));
    await page.route("https://static-res.makextool.com/**", route => route.fulfill({ contentType: "application/javascript", body: `window.atomm = { lifecycle: { on() {} }, app: { getLocale: async () => 'en' }, ui: { toast: async () => 'toast', closeToast: async () => {} } };` }));
    await page.route("**/atomm-test", route => route.fulfill({ contentType: "text/html", body: '<iframe title="Atomm generator" src="/studio" style="width:100%;height:100vh;border:0"></iframe>' }));
    // Hold actual geometry work at its worker load boundary, not with a fake timer.
    let releaseWorker!: () => void;
    const workerGate = new Promise<void>(resolve => { releaseWorker = resolve; });
    try {
      await page.goto(embedded ? "/atomm-test" : "/studio");
      const studio = embedded ? page.frameLocator("iframe") : page;
      if (embedded) await expect(studio.locator(".atomm-workbench")).toBeVisible();
      await expect(studio.getByRole("button", { name: "Generate terrain", exact: true })).toBeVisible();
      await page.route("**/geometry.worker-*.js", async route => { await workerGate; await route.continue(); });
      await studio.getByRole("button", { name: "Generate terrain", exact: true }).click();
      const overlay = studio.locator(".generation-overlay");
      await expect(overlay).toBeVisible();
      await expect(overlay).toContainText("Step 3 of 3");
      await expect(overlay).toContainText("Tracing and repairing contours");
      await expect(studio.locator(".preview-stage")).toHaveAttribute("aria-busy", "true");
      const loader = overlay.locator(".contour-loader");
      await expect(loader).toBeVisible();
      await expect(loader).toHaveAttribute("aria-hidden", "true");
      const ring = loader.locator("span").first();
      expect(await ring.evaluate(el => getComputedStyle(el).animationName)).toBe("contour");
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect(await ring.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
      await expect(overlay).toContainText("Step 3 of 3");
      releaseWorker();
      await expect(overlay).toBeHidden({ timeout: 30_000 });
      await expect(studio.locator(".preview-stage")).toHaveAttribute("aria-busy", "false");
      await expect(studio.locator(".status-line")).toContainText("Real terrain ready");
    } finally { releaseWorker(); }
  });
}
