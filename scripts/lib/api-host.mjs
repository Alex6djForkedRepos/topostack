// Shared by scripts/release/validate-submission-env.mjs (pre-build gate) and
// scripts/verify/verify-atomm-dist.mjs (built-artifact scan) so both reject the same
// placeholder and development endpoint families.
const FORBIDDEN_SUFFIXES = [".localhost", ".invalid", ".test", ".local", ".example", ".workers.dev"];

/** True for hosts that can never be a deployed production map API endpoint. */
export function isForbiddenApiHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
  // Reserved/special-use TLDs (RFC 2606/6761) and Workers preview hosts are
  // never valid production endpoints for a submitted artifact.
  if (FORBIDDEN_SUFFIXES.some((suffix) => host.endsWith(suffix) || host === suffix.slice(1))) return true;
  if (host.includes("example.")) return true;
  return false;
}
