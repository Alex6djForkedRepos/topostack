import { chromium } from "playwright";
import { PNG } from "pngjs";
import { readFile, writeFile, mkdir, mkdtemp, copyFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Reproducible listing cards: genuine embedded UI and model pixels, with captions.
// Run against the current generator and deployed data API; no E2E fixture build.
const origin = process.env.TOPOSTACK_CAPTURE_URL ?? "http://127.0.0.1:5284";
const ffmpeg = process.env.FFMPEG_PATH ?? "ffmpeg";
const root = new URL("../../atomm/", import.meta.url);
const scratch = await mkdtemp(join(tmpdir(), "topostack-listing-"));
const assets = new URL("assets/", root);
await mkdir(assets, { recursive: true });
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const project = JSON.parse(await readFile(new URL("media-project-v4.json", root), "utf8"));
project.name = "Crater Lake";
project.sheetNesting = { sheetWidthMm: 600, sheetHeightMm: 400, marginMm: 3, spacingMm: 2, rotation: "quarter", timeBudgetS: 5, seed: 1 };
const media = [], surveyResponses = new Set(), errors = [];
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  page.setDefaultTimeout(60_000);
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.ok() && /usgs-crater-lake/.test(response.url())) surveyResponses.add(response.url()); });
  await page.route("https://static-res.makextool.com/**", route => route.fulfill({ contentType: "application/javascript", body: `window.atomm = { lifecycle: { on(event, hook) { if(event === 'export') window.captureExport = hook; } }, app: { getLocale: async () => 'en', getSupportedLocales: async () => [] }, ui: { toast: async () => '', closeToast: async () => {} } };` }));
  await page.route("https://topostack.app/v1/**", async route => {
    const headers = { ...route.request().headers() }; delete headers.origin; delete headers.referer;
    await route.fulfill({ response: await route.fetch({ headers, timeout: 180_000 }) });
  });
  await page.route(`${origin}/atomm-media-frame`, route => route.fulfill({ contentType: "text/html", body: '<body style="margin:0"><iframe src="/studio" style="width:100vw;height:100vh;border:0;display:block"></iframe></body>' }));
  await page.goto(origin);
  await page.evaluate(async value => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("keyval-store", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("keyval");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction("keyval", "readwrite");
        tx.objectStore("keyval").put(value, "topostack:project:v1");
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
  }, project);
  await page.goto(`${origin}/atomm-media-frame`);
  const studio = page.frameLocator("iframe");
  const frame = () => page.frames().find(candidate => candidate !== page.mainFrame());
  const settled = async () => { await studio.locator('.preview-stage[aria-busy="false"]').waitFor(); await page.waitForTimeout(1000); };
  await studio.locator(".status-line", { hasText: "Real terrain ready" }).waitFor({ timeout: 180_000 });
  await settled();
  if (!surveyResponses.size) throw new Error("No successful Crater Lake survey request; refusing to label fixture or modeled-only media as surveyed.");
  console.log("Real terrain ready", await studio.locator(".status-line").innerText());
  const cardPage = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  async function card(id, title, subtitle, png, caption = "Crater Lake · Software preview · Review material and machine settings before fabrication") {
    const name = `topostack-${id}-v6.png`;
    await cardPage.setContent(`<html><head><style>*{box-sizing:border-box}body{margin:0;background:#e7e8e9;color:#1d302e;font-family:Arial,sans-serif;padding:48px 64px}header{display:flex;justify-content:space-between;font-size:22px;font-weight:700;letter-spacing:-.5px}header span{font-size:16px;font-weight:400;letter-spacing:2px}h1{font-size:62px;letter-spacing:-2.5px;line-height:1.08;margin:30px 0 12px}p{font-size:26px;margin:0 0 30px;color:#405451}main{height:840px;display:flex;align-items:center;justify-content:center}img{width:100%;height:100%;object-fit:contain;border-radius:16px;box-shadow:0 10px 35px #00000012}footer{position:absolute;bottom:35px;left:64px;right:64px;display:flex;justify-content:space-between;color:#52625f;font-size:15px}</style></head><body><header>TopoStack<span>MAP · LAYER · MAKE</span></header><h1>${escape(title)}</h1><p>${escape(subtitle)}</p><main><img src="data:image/png;base64,${png.toString("base64")}"></main><footer><span>${escape(caption)}</span><span>topostack.app</span></footer></body></html>`);
    await cardPage.locator("img").evaluate(img => img.decode());
    const buffer = await cardPage.screenshot({ path: new URL(name, assets).pathname });
    media.push({ file: `assets/${name}`, bytes: buffer.length, sha256: createHash("sha256").update(buffer).digest("hex"), width: 1600, height: 1200, sourceCommit, title, subtitle });
    console.log("Saved", name);
  }
  const view = async name => { await studio.getByRole("radio", { name, exact: true }).click(); await settled(); };
  const shot = () => page.screenshot({ animations: "disabled" });
  const model = async () => {
    const style = await frame().addStyleTag({ content: ".preview-toolbar, .warning-stack, .atomm-tips, .atomm-zoom-cluster, .preview-attribution { visibility: hidden !important; }" });
    try {
      const stage = studio.locator(".three-stage"), box = await stage.boundingBox();
      const png = PNG.sync.read(await stage.screenshot({ animations: "disabled" }));
      let left = png.width, right = 0, top = png.height, bottom = 0;
      for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
        const i = (y * png.width + x) * 4, r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
        if (r > g + 5 && g > b + 10 && r > 80) { left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); }
      }
      if (right <= left) throw new Error("No terrain visible in model capture");
      const x = Math.max(0, left - 50), y = Math.max(0, top - 50);
      return await page.screenshot({ animations: "disabled", clip: { x: box.x + x, y: box.y + y, width: Math.min(png.width - x, right - x + 50), height: Math.min(png.height - y, bottom - y + 50) } });
    } finally { await style.evaluate(element => element.remove()); }
  };
  await view("3D");
  await studio.getByRole("button", { name: "Fit to canvas", exact: true }).click();
  await studio.locator(".three-stage").press("+");
  await studio.locator(".three-stage").press("+");
  await page.waitForTimeout(1000);
  await card("cover", "A place, made personal.", "Real terrain. Layered reliefs. Ready-to-make artwork.", await model());
  await card("gallery-01-workbench", "Your landscape, your way.", "Shape the terrain and preview every change in Atomm.", await shot());
  await studio.getByRole("slider", { name: "Stack separation", exact: true }).fill("0.7");
  await studio.getByRole("button", { name: "Fit to canvas", exact: true }).click();
  await studio.locator(".three-stage").press("+");
  await studio.locator(".three-stage").press("+");
  await page.waitForTimeout(1500);
  await card("gallery-02-layers", "See how the layers fit.", "Explore the assembled relief or separate the stack before cutting.", await model());
  // Record a genuine control-driven separation/reassembly, without fabricated frames.
  await studio.getByRole("slider", { name: "Stack separation", exact: true }).fill("0");
  await page.waitForTimeout(500);
  await page.bringToFront();
  const canvas = studio.locator(".three-stage canvas");
  const motionStyle = await frame().addStyleTag({ content: ".preview-toolbar, .warning-stack, .atomm-tips, .atomm-zoom-cluster, .preview-attribution { visibility: hidden !important; }" });
  // Capture every state explicitly: headless canvas.captureStream can omit
  // WebGL redraws. Each frame is a screenshot of the real rendered canvas.
  for (let n = 0; n <= 30; n++) {
    const amount = 0.7 * (1 - Math.cos(n / 30 * Math.PI * 2)) / 2;
    await studio.getByRole("slider", { name: "Stack separation", exact: true }).fill(String(Number((Math.round(amount * 20) / 20).toFixed(2))));
    await page.waitForTimeout(100);
    await canvas.screenshot({ path: join(scratch, `motion-${String(n).padStart(3, "0")}.png`) });
  }
  await motionStyle.evaluate(element => element.remove());
  await studio.getByRole("slider", { name: "Stack separation", exact: true }).fill("0");
  await view("2D");
  await card("gallery-03-cut-layer", "Inspect every layer.", "Review cut outlines, score lines and alignment before fabrication.", await shot());
  await studio.getByRole("radio", { name: "Flat engraving", exact: true }).click();
  await settled();
  await view("Engraving");
  await card("gallery-04-flat", "One landscape. Two ways to make.", "Choose flat topographic engraving or a layered relief.", await shot(), "Surface contour artwork · Software preview · Physical dimensions preserved in SVG");
  await studio.getByRole("radio", { name: "Layered relief", exact: true }).click();
  await settled();
  await view("3D");
  await studio.getByRole("button", { name: "Map details", exact: true }).click();
  await studio.getByRole("spinbutton", { name: "Water depth exaggeration", exact: true }).scrollIntoViewIfNeeded();
  await card("gallery-05-depth", "Explore below the shoreline.", "Surveyed lake floors where available, with adjustable depth relief.", await shot(), "USGS survey where available · Terrain or modeled depths fill gaps · Depth exaggerated");
  await studio.getByRole("radio", { name: "Export", exact: true }).click();
  await studio.locator(".atomm-nesting-drafts svg").first().waitFor();
  await card("gallery-06-nesting", "Watch the sheets take shape.", "Automatic nesting, live layouts and a choice to finish early.", await shot());
  await studio.locator('.export-preview[aria-busy="false"] .export-layout-note').waitFor();
  await card("gallery-07-export", "Know what you are exporting.", "See the actual artwork, file contents and cut/score colors.", await shot());
  await studio.getByRole("spinbutton", { name: "Material width", exact: true }).fill("700");
  await studio.getByRole("spinbutton", { name: "Material height", exact: true }).fill("500");
  await studio.locator(".export-layout-note", { hasText: "700 × 500 mm" }).waitFor();
  await card("gallery-08-material", "Fit the material you have.", "Set sheet width and height. The layout updates automatically.", await shot());
  const manifest = await frame().evaluate(async () => { const files = await window.captureExport({ intent: "download" }); return JSON.parse(await files.find(file => file.filename.endsWith("-project.json")).blob.text()); });
  if (errors.length) throw new Error(`Browser errors: ${errors.join("; ")}`);
  await writeFile(new URL("media-project-v6.json", root), JSON.stringify(project, null, 2) + "\n");
  await writeFile(new URL("media-export-v6.json", root), JSON.stringify(manifest, null, 2) + "\n");
  const movie = new URL("topostack-cover-loop-v6.mp4", assets).pathname;
  execFileSync(ffmpeg, ["-y", "-framerate", "5", "-i", join(scratch, "motion-%03d.png"), "-vf", "scale=1600:1200:force_original_aspect_ratio=decrease,pad=1600:1200:(ow-iw)/2:(oh-ih)/2:color=0xe7e8e9,fps=30", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", movie], { stdio: "ignore" });
  const gallery = media.filter(item => item.file.includes("gallery"));
  const list = join(scratch, "showcase.txt");
  await writeFile(list, [...gallery.map(item => `file '${new URL(item.file, root).pathname}'\nduration 4`), `file '${new URL(gallery.at(-1).file, root).pathname}'`].join("\n"));
  const showcase = new URL("topostack-showcase-v6.mp4", assets).pathname;
  execFileSync(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-vf", "fps=30", "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", showcase], { stdio: "ignore" });
  for (const file of ["topostack-cover-loop-v6.mp4", "topostack-showcase-v6.mp4"]) {
    execFileSync(ffmpeg, ["-v", "error", "-i", new URL(file, assets).pathname, "-f", "null", "-"], { stdio: "pipe" });
    const bytes = await readFile(new URL(file, assets));
    media.push({ file: `assets/${file}`, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), width: 1600, height: 1200, sourceCommit, fullDecodePassed: true, codec: "H.264", fps: 30, audio: false });
  }
  const archive = new URL("media-provenance-v5.json", root);
  try { await access(archive); } catch { await copyFile(new URL("media-provenance.json", root), archive); }
  await writeFile(new URL("media-provenance.json", root), JSON.stringify({ schemaVersion: 6, capturedAt: new Date().toISOString(), sourceCommit, developmentBase: execFileSync("git", ["rev-parse", "origin/dev"], { encoding: "utf8" }).trim(), version: "0.6.0 candidate (version preparation pending)", origin, projectFile: "media-project-v6.json", exportFile: "media-export-v6.json", method: "Current embedded studio with genuine live terrain/survey data. Native UI/model screenshots with typography around unchanged app pixels. SDK mount/export stand-in only; no fixture terrain, AI imagery or fabricated UI. Cover movie sequences actual canvas screenshots while the explode control changes, with no generated intermediate frames. Showcase is a captioned screenshot slideshow. Historical v5 media remains on disk but is excluded from this upload set.", surveyResponses: [...surveyResponses], source: manifest.result, attribution: manifest.attribution, media }, null, 2) + "\n");
  console.log("Completed", media.length, "media files", scratch);
} finally { await browser.close(); }
