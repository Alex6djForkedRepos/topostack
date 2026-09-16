/** Do not include provider response bodies in errors: some APIs return credentials. */
export function cloudflareClient(accountId = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN) {
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !token) throw new Error("A Cloudflare account ID and API token are required.");
  return async (path, init = {}) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
      ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json();
    if (!response.ok || payload.success !== true) throw new Error(`Cloudflare API request failed (${response.status}; codes: ${(payload.errors ?? []).map((error) => error.code).join(",")}).`);
    return payload.result;
  };
}
