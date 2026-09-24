import { del, get, set } from "idb-keyval";
import type { SheetNestPlanV1 } from "@topostack/core";

/**
 * Sheet layouts the maker found, kept in this browser so a reload does not
 * throw away minutes of searching. A layout is stored under its job key: the
 * hash of the parts and sheet settings it was made for. It is found again
 * only while the design and settings are unchanged, and the export checks it
 * against the geometry once more before using it.
 */

export interface CachedNestPlan {
  plan: SheetNestPlanV1;
  /** Whether the maker exports with it, or chose the original panels again. */
  useSheets: boolean;
  savedAt: number;
}

const PREFIX = "nest-plan:";
const INDEX_KEY = "nest-plan-index";
/** Layouts kept; the least recently saved one goes first. */
export const MAX_CACHED_NEST_PLANS = 20;

function isPlan(value: unknown, jobKey: string): value is SheetNestPlanV1 {
  const plan = value as Partial<SheetNestPlanV1> | undefined;
  return Boolean(plan && plan.schemaVersion === 1 && plan.jobKey === jobKey && Array.isArray(plan.sheets) && plan.settings && plan.engine);
}

export async function loadNestPlan(jobKey: string): Promise<CachedNestPlan | undefined> {
  try {
    const entry = await get<CachedNestPlan>(PREFIX + jobKey);
    if (!entry || !isPlan(entry.plan, jobKey)) return undefined;
    return { plan: entry.plan, useSheets: entry.useSheets !== false, savedAt: Number(entry.savedAt) || 0 };
  } catch {
    // Blocked or broken storage only costs the maker a new search.
    return undefined;
  }
}

export async function saveNestPlan(plan: SheetNestPlanV1, useSheets: boolean, now = Date.now()): Promise<void> {
  try {
    await set(PREFIX + plan.jobKey, { plan, useSheets, savedAt: now } satisfies CachedNestPlan);
    const index = ((await get<string[]>(INDEX_KEY)) ?? []).filter((key) => key !== plan.jobKey);
    index.push(plan.jobKey);
    const evicted = index.splice(0, Math.max(0, index.length - MAX_CACHED_NEST_PLANS));
    await set(INDEX_KEY, index);
    await Promise.all(evicted.map((key) => del(PREFIX + key)));
  } catch {
    // Not saving is harmless: the plan still works for this session.
  }
}

/** Remember whether the maker exports with a saved layout. */
export async function setNestPlanChoice(jobKey: string, useSheets: boolean): Promise<void> {
  const entry = await loadNestPlan(jobKey);
  if (!entry || entry.useSheets === useSheets) return;
  try {
    await set(PREFIX + jobKey, { ...entry, useSheets });
  } catch {
    // As above.
  }
}
