// The studio marks a release the visitor has not opened the changelog for.
// Only the newest version string is stored; a first visit records the current
// release silently, so new visitors are not greeted with an unread marker.
import latest from "../../../../../changelog/latest.json" with { type: "json" };

export const CHANGELOG_SEEN_KEY = "topostack-changelog-seen";
export const LATEST_VERSION = latest.version;

type VersionStore = Pick<Storage, "getItem" | "setItem">;

export function hasUnseenRelease(storage: VersionStore, version: string): boolean {
  try {
    const seen = storage.getItem(CHANGELOG_SEEN_KEY);
    if (seen === null) storage.setItem(CHANGELOG_SEEN_KEY, version);
    return seen !== null && seen !== version;
  } catch {
    return false;
  }
}

export function markReleaseSeen(storage: VersionStore, version: string): void {
  try { storage.setItem(CHANGELOG_SEEN_KEY, version); } catch { /* The marker is optional. */ }
}
