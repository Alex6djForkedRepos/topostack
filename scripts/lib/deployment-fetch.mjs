export async function fetchWithRetry(base, path, init, {
  allowRolloutStatuses = false,
  verificationTimeoutMs = 180_000,
  retryDelayMs = 3_000,
} = {}) {
  let lastError;
  const deadline = Date.now() + verificationTimeoutMs;
  let attempt = 0;
  do {
    attempt += 1;
    try {
      const response = await fetch(new URL(path, base), {
        ...init,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const error = new Error(`${init?.method ?? "GET"} ${path} returned HTTP ${response.status}`);
        // During rollout, an edge can still serve the previous origin policy
        // or route table. Ordinary monitoring must still fail these immediately.
        error.retryable = response.status >= 500 || response.status === 429
          || (allowRolloutStatuses && [403, 404].includes(response.status));
        await response.body?.cancel();
        throw error;
      }
      return response;
    } catch (error) {
      if (error?.retryable === false) throw error;
      lastError = error;
      if (Date.now() + retryDelayMs >= deadline) break;
      console.warn(`Deployment verification attempt ${attempt} failed: ${error.message}; retrying.`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  } while (Date.now() < deadline);
  throw lastError;
}

