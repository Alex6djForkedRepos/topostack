import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Every non-directory entry below `directory` (a path or file URL), as file URLs. */
export async function filesBelow(directory) {
  const root = directory instanceof URL ? fileURLToPath(directory) : directory;
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => !entry.isDirectory()).map((entry) => pathToFileURL(join(entry.parentPath, entry.name)));
}
