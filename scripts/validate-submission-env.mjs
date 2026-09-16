// Fail-closed gate for Atomm packaging: the embedded map API URL must be a
// deployed HTTPS endpoint on a real domain. scripts/verify-atomm-dist.mjs
// re-checks the built artifact with the same shared host policy.
import { isForbiddenApiHost } from "./lib/api-host.mjs";

const raw = process.env.VITE_MAP_API_URL;
if (!raw) throw new Error("VITE_MAP_API_URL is required when packaging for Atomm.");
const url = new URL(raw);

if (url.protocol !== "https:" || isForbiddenApiHost(url.hostname) || url.username || url.password || (url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) {
  throw new Error("VITE_MAP_API_URL must be a deployed HTTPS origin without credentials, a path, query, or fragment, and cannot use localhost, reserved placeholders, or workers.dev.");
}
