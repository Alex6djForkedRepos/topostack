/** Verify the production nested workers, fonts, cancellation, and fallback in real browsers.
 * Run after building core and generator. Serves build assets on loopback only.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';
import { DEFAULT_PROJECT, createSyntheticSource, generateGeometry, registerFont, decodeFontGlyphs } from '@topostack/core';

const root = resolve('apps/generator/dist');
const files = await readdir(root, { recursive: true });
const workerPath = files.find(file => /geometry\.worker-[^/]+\.js$/.test(file));
assert(workerPath, 'Build the generator first.');
const requested = [];
let denyHelpers = false;
const headers = await readFile(resolve(root, '_headers'), 'utf8');
// Production is HTTPS; this loopback-only harness is HTTP. WebKit upgrades
// even loopback worker URLs unless this transport directive is removed.
const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1].replace(/; upgrade-insecure-requests/g, '');
assert(csp, 'Missing production CSP');
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  requested.push(path);
  if (denyHelpers && /geometry-task\.worker-/.test(path)) { res.writeHead(503).end(); return; }
  res.setHeader('Content-Security-Policy', csp);
  if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Parallel geometry verification</title>'); return; }
  const file = resolve(root, `.${path}`);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream');
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const comparable = result => ({ ...result, generatedAt: '' });
// JS engines can differ in the last bits of transcendental functions. Keep
// structure/text exact and allow only 1e-8 mm in numeric cross-engine comparisons.
function sameGeometry(actual, expected, path = 'geometry') {
  if (typeof actual === 'number' && typeof expected === 'number') {
    assert(Math.abs(actual - expected) <= 1e-8, `${path}: ${actual} != ${expected}`);
  } else if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const key of Object.keys(expected)) sameGeometry(actual[key], expected[key], `${path}.${key}`);
  } else assert.equal(actual, expected, path);
}
const large = { ...DEFAULT_PROJECT, widthMm: 1200, heightMm: 1200 };
const source = createSyntheticSource(large, 64);
const plainExpected = comparable(generateGeometry(large, source));
const custom = { ...large, textStyle: { ...large.textStyle, font: 'hershey-sans' } };
registerFont(decodeFontGlyphs(JSON.parse(await readFile('apps/generator/src/lib/domain/font-glyphs/hershey-sans.json', 'utf8'))));
const fontExpected = comparable(generateGeometry(custom, source));
const firefoxAppData = resolve('node_modules/.cache/topostack/firefox-app-data');
if (process.platform === 'darwin') await mkdir(firefoxAppData, { recursive: true });
const browsers = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit'];
try {
  for (const name of browsers) {
    assert(['chromium', 'firefox', 'webkit'].includes(name));
    const browser = await ({ chromium, firefox, webkit })[name].launch({ headless: true, ...(name === 'firefox' && process.platform === 'darwin' ? { env: { ...process.env, MOZ_APP_DATA: firefoxAppData } } : {}) });
    try {
      let page = await browser.newPage();
      const warnings = [];
      page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text()); });
      await page.goto(origin);
      const result = await page.evaluate(async ({ workerPath, large, custom, source }) => {
        const worker = new Worker(`/${workerPath}`, { type: 'module' });
        const pending = new Map();
        const progress = [];
        let cancelOnProgress = false;
        worker.onmessage = ({ data }) => {
          if (data.ready) return;
          if (data.progress) {
            progress.push(data.progress);
            if (cancelOnProgress) { cancelOnProgress = false; worker.postMessage({ cancelId: data.id }); }
            return;
          }
          const request = pending.get(data.id);
          if (!request) return;
          pending.delete(data.id);
          if (data.error) request.reject(new Error(data.error)); else request.resolve(data);
        };
        worker.onerror = event => { for (const request of pending.values()) request.reject(new Error(event.message || 'Coordinator worker failed')); };
        const run = (id, config, includeSource = false) => new Promise((resolve, reject) => {
          pending.set(id, { resolve, reject });
          worker.postMessage({ id, config, sourceId: 1, ...(includeSource ? { source } : {}) });
        });
        const timeout = setTimeout(() => { for (const request of pending.values()) request.reject(new Error('Worker verification timed out')); }, 60_000);
        try {
          const first = await run(1, large, true);
          const font = await run(2, custom);
          cancelOnProgress = true;
          const cancelled = await run(3, large);
          const recovered = await run(4, large);
          return { first: first.result, font: font.result, cancelled, recovered: recovered.result, progress, cpu: navigator.hardwareConcurrency };
        } finally { clearTimeout(timeout); worker.terminate(); }
      }, { workerPath, large, custom, source }).catch(error => { console.error({ browser: name, warnings, recentRequests: requested.slice(-10) }); throw error; });
      sameGeometry(comparable(result.first), plainExpected);
      sameGeometry(comparable(result.font), fontExpected);
      assert.equal(result.cancelled.cancelled, true);
      assert.deepEqual(comparable(result.recovered), comparable(result.first));
      assert(result.progress.some(item => item.stage === 'alignment'));
      assert(result.progress.some(item => item.stage === 'elevation-labels'));
      assert(!warnings.some(warning => warning.includes('helpers unavailable')), warnings.join('\n'));
      assert(requested.some(path => /geometry-task\.worker-/.test(path)), 'No helper worker requested');
      console.log(`${name}: production workers, custom font, cancellation, cache reuse, and serial parity passed (${result.cpu} CPUs).`);

      // Deny only the helpers: the existing coordinator must finish correctly.
      await page.close();
      denyHelpers = true;
      page = await browser.newPage();
      page.on('console', message => { if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text()); });
      await page.goto(origin);
      const fallback = await page.evaluate(async ({ workerPath, large, source }) => {
        const worker = new Worker(`/${workerPath}`, { type: 'module' });
        try {
          return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Fallback timed out')), 60_000);
            worker.onerror = event => { clearTimeout(timer); reject(new Error(event.message || 'Coordinator worker failed')); };
            worker.onmessage = ({ data }) => {
              if (data.result || data.error) { clearTimeout(timer); if (data.error) reject(new Error(data.error)); else resolve(data.result); }
            };
            worker.postMessage({ id: 1, config: large, sourceId: 1, source });
          });
        } finally { worker.terminate(); }
      }, { workerPath, large, source });
      assert.deepEqual(comparable(fallback), comparable(result.first));
      assert(warnings.some(warning => warning.includes('helpers unavailable')), 'Fallback was not exercised');
      console.log(`${name}: blocked-helper fallback preserved exact output.`);
    } finally { denyHelpers = false; await browser.close(); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
