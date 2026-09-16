import { execFileSync } from "node:child_process";
import { appendFile, writeFile } from "node:fs/promises";
import { readVersions } from "./versions.mjs";

const root = new URL("../", import.meta.url);
const environment = process.env.VITE_SITE_ENV ?? "development";
if (!["production", "development", "atomm"].includes(environment)) throw new Error("Invalid build environment");
const { version, atommVersion } = await readVersions();
// Source archives can be built without Git; do not invent a source revision.
let commit = null;
let workingTreeDirty = null;
try {
  commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  workingTreeDirty = Boolean(execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim());
} catch { /* Git metadata is unavailable in source-only distributions. */ }
const metadata = { schemaVersion: 1, version, ...(environment === "atomm" ? { atommVersion } : {}), environment, commit, workingTreeDirty };
await writeFile(new URL("apps/generator/dist/version.json", root), JSON.stringify(metadata, null, 2) + "\n");
await appendFile(new URL("apps/generator/dist/_headers", root), "\n/version.json\n  Cache-Control: no-store\n");
