import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

test("homepage explains the product without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Turn real terrain into");
  await expect(page.getByRole("link", { name: "Start creating", exact: true })).toHaveCount(3);
  for (const link of await page.getByRole("link", { name: "Start creating", exact: true }).all()) {
    // Inspect the HTML attribute so this works with JavaScript disabled in Firefox.
    const href = await link.getAttribute("href");
    expect(new URL(href ?? "", baseURL).href).toBe(`${baseURL}/studio`);
  }
  await page.getByText("View data sources and credits").click();
  await expect(page.getByRole("link", { name: "OpenStreetMap contributors" })).toBeVisible();
  await context.close();
});

test("homepage stays lightweight and opens the studio under the built CSP", async ({ page, baseURL }) => {
  const headers = readFileSync("apps/generator/dist/_headers", "utf8");
  const policy = headers.match(/Content-Security-Policy: (.+)/)?.[1]?.replace("; upgrade-insecure-requests", "");
  if (!policy) throw new Error("Missing production Content-Security-Policy header");
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
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Turn real terrain into");
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

test("mobile readers can navigate guides, examples and the studio with correct metadata", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("https://static-res.makextool.com/**", (route) => route.abort());
  const events: Record<string, unknown>[] = [];
  await page.route("**/v1/events", async (route) => {
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
  await page.goto("/?utm_source=github");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow, max-image-preview:large");
  await page.getByRole("link", { name: "How to make a layered topographic map" }).click();
  await expect(page).toHaveTitle("How to Make a Laser-Cut Topographic Map | TopoStack");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://topostack.echofoxtrot.works/guides/laser-cut-topographic-map");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Layered map guide");
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("navigation", { name: "Guides", exact: true })).toBeHidden();
  await page.getByText("Browse guides", { exact: true }).click();
  await page.getByRole("navigation", { name: "Guides menu" }).getByRole("link", { name: "Crater Lake example", exact: true }).click();
  await expect(page).toHaveTitle("Crater Lake Topographic Map: A Terrain Project | TopoStack");
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toContainText("Make a map");
  await expect(page.getByRole("navigation", { name: "Previous and next guides" }).getByRole("link", { name: /Next\s*How lake depths work/ })).toBeVisible();
  await expect(page.locator("article img")).toBeVisible();
  await page.getByRole("link", { name: "Open the terrain studio", exact: true }).click();
  await expect(page).toHaveURL(baseURL + "/studio");
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow");
  await expect.poll(() => events.map((event) => event.event)).toEqual(["landing_view", "studio_open"]);
  expect(events.every((event) => event.source === "github" && event.landing === "/")).toBe(true);
});

test("a guide explains the workflow with JavaScript disabled", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto("/guides/topographic-map-engraving");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Create a topographic map SVG for laser engraving");
  await expect(page.getByText("The primary file ends in", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the studio", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Guides", exact: true }).getByRole("link", { name: "Engraving guide" })).toHaveAttribute("aria-current", "page");
  await context.close();
});

test("the guides hub lists every guide and marks the current page in the sidebar", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("link", { name: "Guides", exact: true }).first().click();
  await expect(page).toHaveURL(baseURL + "/guides");
  await expect(page).toHaveTitle("Topographic Map Guides and Documentation | TopoStack");
  await expect(page.getByRole("heading", { level: 2, name: "Lakes and depth" })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: /^How lake depths work/ }).click();
  const sidebar = page.getByRole("navigation", { name: "Guides", exact: true });
  await expect(sidebar.getByRole("link", { name: "How lake depths work" })).toHaveAttribute("aria-current", "page");
  const toc = page.getByRole("navigation", { name: "On this page" });
  await expect(toc.getByRole("link", { name: "Three kinds of information, different jobs" })).toHaveAttribute("href", "#sources-title");
  await toc.getByRole("link", { name: "How to read the result" }).click();
  await expect(toc.getByRole("link", { name: "How to read the result" })).toHaveAttribute("aria-current", "location");
  expect(await page.evaluate(() => document.body.scrollWidth <= innerWidth)).toBe(true);
});
