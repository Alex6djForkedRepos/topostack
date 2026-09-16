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
