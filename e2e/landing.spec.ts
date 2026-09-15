import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("homepage explains the product without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A place you love.");
  await expect(page.getByRole("link", { name: "Start creating", exact: true })).toHaveCount(3);
  for (const link of await page.getByRole("link", { name: "Start creating", exact: true }).all()) {
    await expect(link).toHaveJSProperty("href", `${baseURL}/studio`);
  }
  await page.getByText("View data sources and credits").click();
  await expect(page.getByRole("link", { name: "OpenStreetMap contributors" })).toBeVisible();
  await context.close();
});

test("homepage stays lightweight and opens the studio under the built CSP", async ({ page, baseURL }) => {
  const headers = readFileSync("apps/generator/dist/_headers", "utf8");
  const policy = headers.match(/Content-Security-Policy: (.+)/)![1].replace("; upgrade-insecure-requests", "");
  const errors: string[] = [];
  const workers: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.route("https://static-res.makextool.com/**", (route) => route.abort());
  await page.route(`${baseURL}/`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": policy } });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByRole("button", { name: /Colour scheme/ }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("topostack-theme"))).not.toBeNull();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 375);
  expect(workers).toEqual([]);
  await expect(page.locator(".app-shell")).toHaveCount(0);
  await page.getByRole("link", { name: "See how it works" }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole("heading", { name: "Find it. Shape it. Make it." })).toBeInViewport();
  await page.getByRole("link", { name: "Try the terrain studio" }).click();
  await expect(page).toHaveURL(`${baseURL}/studio`);
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
  const home = page.getByRole("link", { name: "TopoStack home and getting started" });
  await expect(home).toHaveAttribute("target", "_blank");
  await expect(home).toHaveJSProperty("href", `${baseURL}/`);
  // A return visit must restore page scrolling after editor CSS was loaded.
  await page.goBack();
  await page.getByRole("link", { name: "Make a donation" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("link", { name: "Make a donation" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("old About links redirect to the homepage", async ({ page, baseURL }) => {
  await page.goto("/about");
  await expect(page).toHaveURL(`${baseURL}/`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A place you love.");
});

test("direct studio visits restore saved project settings", async ({ page }) => {
  await page.route("https://static-res.makextool.com/**", (route) => route.abort());
  await page.goto("/studio");
  const name = page.getByRole("textbox", { name: "Project name", exact: true });
  await name.fill("My saved landscape");
  await expect.poll(() => page.evaluate(() => new Promise<string | undefined>((resolve, reject) => {
    const request = indexedDB.open("keyval-store");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("keyval", "readonly").objectStore("keyval").get("topostack:project:v1");
      read.onsuccess = () => { db.close(); resolve(read.result?.name); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
  }))).toBe("My saved landscape");
  await page.goto("/");
  await page.getByRole("link", { name: "Start creating", exact: true }).first().click();
  await expect(name).toHaveValue("My saved landscape");
  await page.reload();
  await expect(name).toHaveValue("My saved landscape");
});
