import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Run against the normal frontend, with its bundled real-data preview.
const origin = process.env.TOPOSTACK_CAPTURE_URL ?? "http://127.0.0.1:5273";
const output = new URL("../docs/images/", import.meta.url);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  await page.goto(origin);
  await page.locator(".workflow-art svg").first().waitFor();
  await page.evaluate(() => document.fonts.ready);

  // Standalone SVGs cannot inherit the app's CSS variables or Svelte classes.
  const workflows = await page.evaluate(() => {
    const ns = "http://www.w3.org/2000/svg";
    const theme = getComputedStyle(document.querySelector(".landing-page"));
    const color = (name) => theme.getPropertyValue(`--loidolt-${name}`).trim();
    const root = document.createElementNS(ns, "svg");
    root.setAttribute("xmlns", ns);
    root.setAttribute("viewBox", "0 0 960 360");
    root.setAttribute("role", "img");
    root.setAttribute("aria-labelledby", "title description");
    const add = (tag, attributes, text) => {
      const element = document.createElementNS(ns, tag);
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
      if (text) element.textContent = text;
      root.append(element);
    };
    add("title", { id: "title" }, "Two ways to make terrain with TopoStack");
    add("desc", { id: "description" }, "Layered relief stacks cut contours into a physical landscape. Flat engraving draws contour lines on a single surface.");
    add("rect", { width: "960", height: "360", fill: color("surface") });
    add("path", { d: "M480 24V336", stroke: color("border") });
    const styles = ["fill", "stroke", "stroke-width", "stroke-dasharray", "font-family", "font-size", "font-weight", "letter-spacing"];
    document.querySelectorAll(".workflow-art svg").forEach((source, index) => {
      add("text", { x: String(32 + index * 480), y: "44", fill: color("text"), "font-family": "Arial, sans-serif", "font-size": "24" }, index === 0 ? "Layered relief" : "Flat engraving");
      const clone = source.cloneNode(true);
      const originals = [source, ...source.querySelectorAll("*")];
      const copies = [clone, ...clone.querySelectorAll("*")];
      originals.forEach((element, i) => {
        const computed = getComputedStyle(element);
        copies[i].removeAttribute("class");
        copies[i].removeAttribute("style");
        copies[i].removeAttribute("aria-hidden");
        for (const property of styles) copies[i].setAttribute(property, computed.getPropertyValue(property));
      });
      clone.setAttribute("x", String(10 + index * 480));
      clone.setAttribute("y", "64");
      clone.setAttribute("width", "460");
      clone.setAttribute("height", "280");
      root.append(clone);
    });
    return new XMLSerializer().serializeToString(root);
  });
  await writeFile(new URL("workflows.svg", output), `${workflows}\n`);

  // A fresh browser context has no saved project: this is the shipped Crater
  // Lake sample. Keep its attribution and preview/export notices visible.
  await page.goto(new URL("/studio", origin).href);
  await page.locator(".three-stage canvas").waitFor();
  await page.locator('.preview-stage[aria-busy="false"]').waitFor();
  await page.getByText("Real-data sample preview ready", { exact: true }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  // Allow the WebGL scene and its initial camera framing to paint.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: new URL("studio-crater-lake.png", output).pathname, animations: "disabled" });
  console.log(`README assets saved to ${output.pathname}`);
} finally {
  await browser.close();
}
