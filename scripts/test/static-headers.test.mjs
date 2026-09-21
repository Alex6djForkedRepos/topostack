import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { finalizeStaticHeaders, pageSecurityPolicy, validateStaticHeaders } from "../lib/static-headers.mjs";
const template = readFileSync(new URL("../../apps/generator/static/_headers", import.meta.url), "utf8");
const hash = script => "'sha256-" + createHash("sha256").update(script).digest("base64") + "'";
const pages = new Map([["404.html", "<h1>Not found</h1>"], ["index.html", "<script>home()</script>"], ["studio.html", "<script>studio()</script>"], ...Array.from({length: 30}, (_, i) => [`guides/page-${i}.html`, `<script>guide(${i})</script>`])]);
test("many prerendered pages stay under deployment limits with page-specific hashes", () => {
 const output = finalizeStaticHeaders(template, pages, "production");
 assert.ok(output.split("\n").every(line => line.length <= 2000));
 assert.ok(pageSecurityPolicy(output, "/").includes(hash("home()")));
 assert.ok(!pageSecurityPolicy(output, "/").includes(hash("studio()")));
 // Cloudflare serves `/` with the fallback policy as well, so it must allow the home page.
 assert.ok(pageSecurityPolicy(output, "/*").includes(hash("home()")));
 for (const path of ["/studio", "/studio.html"]) {
  assert.ok(pageSecurityPolicy(output, path).includes(hash("studio()")));
  assert.match(output, new RegExp(`${path.replaceAll('.', '\\.')}\\n  ! Content-Security-Policy\\n[^\\n]+\\n  X-Robots-Tag: noindex, follow`));
 }
 assert.ok(!output.includes("unsafe-inline' https"));
 assert.match(output, /object-src 'none'/);
 assert.match(output, /frame-ancestors 'self'/);
 assert.doesNotMatch(output, /script-src[^;]*unsafe-inline/);
});
test("pages without scripts of their own fall back to the site policy instead of adding rules", () => {
 const staticPages = new Map([...pages, ...Array.from({length: 120}, (_, i) => [`lakes/page-${i}.html`, `<script>home()</script><script type="application/ld+json">{"page":${i}}</script>`])]);
 const output = finalizeStaticHeaders(template, staticPages, "production");
 assert.doesNotMatch(output, /\/lakes\/page-/);
 assert.equal(pageSecurityPolicy(output, "/lakes/page-3"), pageSecurityPolicy(output, "/*"));
 assert.ok(!pageSecurityPolicy(output, "/*").includes(hash('{"page":3}')), "JSON-LD needs no script hash");
 assert.ok(pageSecurityPolicy(output, "/guides/page-3").includes(hash("guide(3)")));
});
test("development excludes indexing and rejects limits before deployment", () => {
 assert.match(finalizeStaticHeaders(template, pages, "development"), /\/\*\n {2}X-Robots-Tag: noindex, follow/);
 assert.throws(() => validateStaticHeaders(`/*\n  X: ${'a'.repeat(2000)}`), /2000/);
 assert.throws(() => validateStaticHeaders(Array.from({length: 101}, (_, i) => `/page-${i}`).join('\n')), /100 rule/);
});
