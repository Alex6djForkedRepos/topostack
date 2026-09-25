import { readFile, readdir, writeFile } from "node:fs/promises";
import { finalizeStaticHeaders } from "../lib/static-headers.mjs";

const dist = new URL("../../apps/generator/dist/", import.meta.url);
// The in-chat preview (mcp-app/) is an MCP resource, not a site page: chat
// hosts apply their own policy to it, so it gets no script hashes here.
const pages = (await readdir(dist, { recursive: true })).filter(path => path.endsWith(".html") && !path.startsWith("mcp-app/"));
const contents = new Map(await Promise.all(pages.map(async path => [path, await readFile(new URL(path, dist), "utf8")])));
const headersUrl = new URL("_headers", dist);
const headers = finalizeStaticHeaders(await readFile(headersUrl, "utf8"), contents, process.env.VITE_SITE_ENV ?? "development");
await writeFile(headersUrl, headers);
