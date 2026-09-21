import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
// @topostack/core resolves to its built dist at runtime: run `npm run build -w @topostack/core` first.
import { DEFAULT_PROJECT } from "@topostack/core";
import { decodeTerrainPng } from "@topostack/data-contracts/terrain-png";

const origin = new URL(process.env.PUBLIC_APP_URL ?? "http://localhost:5273");
if (origin.username || origin.password || !["https:", "http:"].includes(origin.protocol)) throw new Error("PUBLIC_APP_URL must be an HTTP(S) URL without credentials.");
const output = resolve(process.env.DATA_BENCHMARK_OUTPUT ?? "test-results/data-benchmark.json");
const cases = [
  { name: "crater-lake", project: DEFAULT_PROJECT },
  { name: "dense-seattle", project: { ...DEFAULT_PROJECT, outputMode: "engraving", location: { label: "Seattle", lat: 47.61, lon: -122.33, zoom: 13 }, showWaterDepth: false } },
  { name: "large-cascades", project: { ...DEFAULT_PROJECT, outputMode: "engraving", showWaterDepth: false, showRoads: false, showTrails: false, showWater: false,
    location: { label: "Cascades", lat: 47, lon: -121.5, zoom: 12, bounds: { west: -123, south: 46, east: -120, north: 48 } } } },
];
const selected = process.env.DATA_BENCHMARK_CASE;
if (selected && !cases.some((item) => item.name === selected)) throw new Error("Unknown DATA_BENCHMARK_CASE.");
const results = [];
const browser = await chromium.launch();
try {
  for (const scenario of cases.filter((item) => !selected || item.name === selected)) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable"); await cdp.send("Network.enable");
    let active;
    const requests = new Set();
    cdp.on("Network.requestWillBeSent", ({ requestId, request }) => {
      if (active && /\/v1\/(terrain\/|osm\.pmtiles|lakes\.pmtiles|bathymetry\/)/.test(request.url)) { requests.add(requestId); active.requests += 1; }
    });
    cdp.on("Network.loadingFinished", ({ requestId, encodedDataLength }) => {
      if (active && requests.has(requestId)) active.transferredBytes += encodedDataLength;
    });
    cdp.on("Network.responseReceived", ({ requestId, response }) => {
      if (!active || !requests.has(requestId)) return;
      const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key.toLowerCase(), value]));
      const cache = headers["x-topostack-cache"] ?? "unknown";
      active.cacheOutcomes[cache] = (active.cacheOutcomes[cache] ?? 0) + 1;
      if (response.fromDiskCache || response.fromServiceWorker) active.browserCacheHits += 1;
      else if (headers["x-topostack-r2-reads"] !== undefined) active.r2Reads += Number(headers["x-topostack-r2-reads"]);
      else active.responsesWithoutR2Metrics += 1;
    });
    const errors = []; page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(new URL("/studio", origin).href, { waitUntil: "domcontentloaded" });
      await page.locator('input[type="file"]').setInputFiles({ name: "benchmark.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(scenario.project)) });
      for (const pass of ["cold-browser", "warm-browser"]) {
        if (pass === "cold-browser") await cdp.send("Network.clearBrowserCache");
        requests.clear();
        active = { scenario: scenario.name, pass, requests: 0, transferredBytes: 0, r2Reads: 0, responsesWithoutR2Metrics: 0, browserCacheHits: 0, cacheOutcomes: {}, peakMainThreadJsHeapBytes: 0 };
        const result = active;
        const start = performance.now();
        let sampling = true;
        const sample = (async () => {
          while (sampling) {
            const { metrics } = await cdp.send("Performance.getMetrics");
            result.peakMainThreadJsHeapBytes = Math.max(result.peakMainThreadJsHeapBytes, metrics.find((item) => item.name === "JSHeapUsedSize")?.value ?? 0);
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        })();
        try {
          await page.getByRole("button", { name: /generate terrain/i }).click();
          await page.getByRole("button", { name: /cancel generation/i }).waitFor({ state: "hidden", timeout: 120000 });
          result.status = await page.locator(".status-line").innerText();
          if (!await page.getByText("Ready to export", { exact: true }).isVisible()) throw new Error(result.status);
          if (!result.requests) throw new Error("Generation produced no data requests.");
          result.ok = true;
        } catch (error) { result.ok = false; result.error = error.message; process.exitCode = 1; }
        finally { sampling = false; await sample; result.durationMs = Math.round(performance.now() - start); active = undefined; results.push(result); console.log(JSON.stringify(result)); }
      }
      if (errors.length) { results.push({ scenario: scenario.name, browserErrors: errors }); process.exitCode = 1; }
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  const png = await readFile(new URL("../apps/generator/src/lib/domain/fixtures/west-point-z12.png", import.meta.url));
  decodeTerrainPng(png); // warm-up outside the measurement
  const cpu = process.cpuUsage(); const start = performance.now();
  for (let i = 0; i < 100; i += 1) decodeTerrainPng(png);
  const used = process.cpuUsage(cpu);
  const report = { generatedAt: new Date().toISOString(), origin: origin.origin,
    notes: ["Cold/warm refer to the browser cache; upstream R2 cache state is reported, not forcibly cleared.", "Heap samples cover the main page JS heap, not GPU or geometry-worker memory.", "R2 counts require the updated gateway; missing telemetry is recorded explicitly.", "Decoder CPU is measured locally in Node, not production Worker CPU."],
    localDecoder: { iterations: 100, wallMsPerTile: (performance.now() - start) / 100, cpuMsPerTile: (used.user + used.system) / 100000 }, results };
  await mkdir(resolve(output, ".."), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
