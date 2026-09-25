import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { lockLakeSlugs } from "../../apps/generator/src/lib/site/lake-places.ts";

// Appends a URL slug for every lake that newly qualifies for its own page
// (/lake/<slug>). Existing slugs never change, so published URLs stay put.
// Run after the lake directory changes: node scripts/build/lock-lake-slugs.mjs
const directoryUrl = new URL("../../apps/generator/static/data/lake-depth-directory.json", import.meta.url);
const lockUrl = new URL("../../apps/generator/src/lib/site/lake-slugs.json", import.meta.url);
const directory = JSON.parse(readFileSync(directoryUrl, "utf8"));
const lock = existsSync(lockUrl) ? JSON.parse(readFileSync(lockUrl, "utf8")) : {};
const next = lockLakeSlugs(directory, lock);
const added = Object.keys(next).length - Object.keys(lock).length;
writeFileSync(lockUrl, JSON.stringify(next, null, 1) + "\n");
console.log(`${added} slug${added === 1 ? "" : "s"} added; ${Object.keys(next).length} locked.`);
