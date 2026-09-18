import { randomUUID } from "node:crypto";
import { open, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Every non-directory entry below `directory` (a path or file URL), as file URLs. */
export async function filesBelow(directory) {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory;
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => !entry.isDirectory()).map((entry) => pathToFileURL(join(entry.parentPath, entry.name)));
}

/**
 * Replaces `target` only with a completely written, fsynced file. The temporary
 * name is unique so concurrent writers never share or clobber a partial file.
 */
export async function writeFileAtomic(target, contents, { mode } = {}) {
  const part = `${target}.${process.pid}.${randomUUID()}.part`;
  try {
    const handle = await open(part, "wx", mode);
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(part, target);
  } catch (error) {
    await rm(part, { force: true });
    throw error;
  }
}

export async function writeJsonAtomic(target, value, options) {
  await writeFileAtomic(target, JSON.stringify(value, null, 2) + "\n", options);
}

/**
 * Where prune and lifecycle rollback receipts are kept. They must survive
 * reboots and tmp cleaners, so the default is a gitignored repo-local
 * directory unless an explicit location is provided.
 */
export function receiptDirectory(env = process.env) {
  return env.LIFECYCLE_RECEIPT_DIR ?? fileURLToPath(new URL("../../.topostack/receipts/", import.meta.url));
}
