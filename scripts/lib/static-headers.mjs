import { createHash } from "node:crypto";

/** Cloudflare joins repeated headers, so remove the fallback CSP before adding
 * each page's policy. Hashes from unrelated pages must not grow one huge line. */
export function finalizeStaticHeaders(template, pages, siteEnvironment) {
  if (!["production", "development", "atomm"].includes(siteEnvironment)) throw new Error("VITE_SITE_ENV must be production, development, or atomm.");
  const placeholder = "__TOPOSTACK_SCRIPT_HASHES__";
  const policyLine = template.split("\n").find(line => line.includes(placeholder));
  if (!policyLine) throw new Error("The static headers file is missing its script-hash placeholder.");
  const policy = html => {
    const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map(match => match[1]).filter(script => script.trim())
      .map(script => "'sha256-" + createHash("sha256").update(script).digest("base64") + "'");
    return policyLine.replace(placeholder, [...new Set(hashes)].join(" "));
  };
  // Cloudflare does not detach the fallback CSP from the root response, so `/`
  // is served both policies and browsers enforce each one. The fallback must
  // authorize the home page scripts or the landing page never hydrates.
  const fallback = [pages.get("404.html"), pages.get("index.html")].filter(Boolean);
  if (!fallback.length) throw new Error("Missing HTML entry page.");
  let headers = template.replace(policyLine, policy(fallback.join("\n")));
  if (siteEnvironment !== "production") headers = headers.replace("/*\n", "/*\n  X-Robots-Tag: noindex, follow\n");
  for (const [filename, html] of [...pages].sort(([a], [b]) => a.localeCompare(b))) {
    const route = filename === "index.html" ? "/" : `/${filename.replace(/\.html$/, "")}`;
    for (const path of [route, `/${filename}`]) {
      headers += `\n${path}\n  ! Content-Security-Policy\n${policy(html)}\n`;
      if (siteEnvironment === "production" && filename === "studio.html") headers += "  X-Robots-Tag: noindex, follow\n";
    }
  }
  if (!headers.includes("sha256-")) throw new Error("No inline scripts were found to hash for the Content Security Policy.");
  validateStaticHeaders(headers);
  return headers;
}

export function validateStaticHeaders(headers) {
  const lines = headers.split("\n");
  const oversized = lines.findIndex(line => line.length > 2000);
  if (oversized >= 0) throw new Error(`Static headers line ${oversized + 1} exceeds Cloudflare's 2000 character limit.`);
  if (lines.filter(line => line && !/^\s|^#/.test(line)).length > 100) throw new Error("Static headers exceed Cloudflare's 100 rule limit.");
}

/** Resolve exact-page CSP for browser tests which serve _headers through Vite. */
export function pageSecurityPolicy(headers, path) {
  let current = "";
  const policies = new Map();
  for (const line of headers.split("\n")) {
    if (line && !/^\s|^#/.test(line)) current = line;
    const match = line.match(/^\s+Content-Security-Policy: (.+)$/);
    if (match) policies.set(current, match[1]);
  }
  return policies.get(path) ?? policies.get("/*");
}
