const origin = new URL(process.env.WORKER_URL);
if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw new Error("WORKER_URL must be an HTTPS origin.");
const response = await fetch(new URL("/v1/upstream-health", origin), { signal: AbortSignal.timeout(15000), cache: "no-store" });
const result = await response.json();
if (!response.ok || result.status !== "healthy" || result.fresh !== true || result.ok !== true) throw new Error("Upstream cache-miss probes are unhealthy, missing, or older than two hours.");
console.log(JSON.stringify(result));
