import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../atomm/", import.meta.url);
const provenance = JSON.parse(await readFile(new URL("media-provenance.json", root), "utf8"));
const files = ["listing.md", "listing-copy.txt", "media-provenance.json", "cover-prompt.txt", "cover-prompt-v2.txt"];
for (const item of provenance.media) {
  assert.match(item.file, /^assets\/[a-z0-9-]+\.png$/);
  const data = await readFile(new URL(item.file, root));
  assert.equal(createHash("sha256").update(data).digest("hex"), item.sha256, `${item.file}: stale media provenance`);
  assert.ok(data.length <= 15_000_000, `${item.file}: exceeds Atomm's image limit`);
  files.push(item.file);
}
assert.ok(provenance.media.length <= 20, "Too many listing images");
await rm(new URL("topostack-listing-upload.zip", root), { force: true });
execFileSync("zip", ["-Xq", "topostack-listing-upload.zip", ...new Set(files)], { cwd: fileURLToPath(root), stdio: "inherit" });
console.log(`Packaged listing text and ${provenance.media.length} images.`);
