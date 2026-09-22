import { del, get, keys, set } from "idb-keyval";
import type { ProjectConfigV1, UserDepthChartRefV1 } from "@topostack/core";
import { parseUserChartBathymetry, type UserChartBathymetryV1 } from "@topostack/data-contracts/chart-bathymetry";
import type { LoadedUserChart } from "$lib/domain/user-bathymetry";

/**
 * Traced depth charts, one IndexedDB entry each.
 *
 * Charts are the maker's own data and stay on their device: a project records
 * only which chart each lake uses, and an exported project file carries the
 * charts it needs beside it. A chart is therefore never fetched from a server,
 * and a project opened on another device simply falls back to the survey
 * providers until its charts are imported.
 */

const PREFIX = "topostack:chart:v1:";
const chartKey = (id: string): string => `${PREFIX}${id}`;

/** A saved chart alongside the hash a project references it by. */
interface StoredChart {
  savedAt: string;
  contentHash: string;
  chart: UserChartBathymetryV1;
}

/**
 * The hash a project pins a chart by: SHA-256 of the record's canonical JSON.
 * The record is already JSON-safe and its key order comes from
 * `parseUserChartBathymetry`, so stringifying it is stable.
 */
export async function chartContentHash(chart: UserChartBathymetryV1): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(chart));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Saves a chart and returns the reference a project stores for a lake. */
export async function saveUserChart(chart: UserChartBathymetryV1): Promise<UserDepthChartRefV1> {
  const parsed = parseUserChartBathymetry(chart);
  const contentHash = await chartContentHash(parsed);
  await set(chartKey(parsed.id), { savedAt: new Date().toISOString(), contentHash, chart: parsed } satisfies StoredChart);
  return { id: parsed.id, contentHash };
}

/**
 * One saved chart, or undefined when it is missing, unreadable, or storage is
 * unavailable. A chart that will not load is not worth failing a render over:
 * the lake falls back to the survey providers, and the warning says so.
 */
export async function loadUserChart(id: string): Promise<LoadedUserChart | undefined> {
  let stored: unknown;
  try {
    stored = await get<unknown>(chartKey(id));
  } catch (error) {
    console.warn("TopoStack: saved depth charts are unavailable in this browser.", error);
    return undefined;
  }
  if (!stored || typeof stored !== "object") return undefined;
  const record = stored as Partial<StoredChart>;
  try {
    const chart = parseUserChartBathymetry(record.chart);
    return { chart, contentHash: typeof record.contentHash === "string" ? record.contentHash : await chartContentHash(chart) };
  } catch (error) {
    console.warn(`TopoStack: the saved depth chart ${id} could not be read.`, error);
    return undefined;
  }
}

/**
 * The charts a project's lakes use, keyed by the same HydroLAKES id. A chart
 * whose content no longer matches what the project was carved from is still
 * used, because the maker's newer trace is the one they mean; the project's
 * reference is what needs updating, and the caller does that when it saves.
 */
export async function loadUserCharts(references: Record<string, UserDepthChartRefV1> | undefined): Promise<Map<string, LoadedUserChart>> {
  const charts = new Map<string, LoadedUserChart>();
  if (!references) return charts;
  const byId = new Map<string, LoadedUserChart>();
  for (const [lake, reference] of Object.entries(references)) {
    let loaded = byId.get(reference.id);
    if (!loaded) {
      loaded = await loadUserChart(reference.id);
      if (!loaded) continue;
      byId.set(reference.id, loaded);
    }
    charts.set(lake, loaded);
  }
  return charts;
}

/** One line per saved chart: enough to list it, and to use it for its lake. */
export interface SavedChartSummary {
  id: string;
  savedAt: string;
  /** The chart's own name. */
  name: string;
  /** The lake it was traced for, which is the only lake it can carve. */
  lakeName: string | undefined;
  hylakId: number | undefined;
  contentHash: string;
}

/** Every saved chart, newest first, for a manager listing. */
export async function listUserCharts(): Promise<SavedChartSummary[]> {
  let stored: IDBValidKey[];
  try {
    stored = await keys();
  } catch (error) {
    console.warn("TopoStack: saved depth charts are unavailable in this browser.", error);
    return [];
  }
  const listed: SavedChartSummary[] = [];
  for (const key of stored) {
    if (typeof key !== "string" || !key.startsWith(PREFIX)) continue;
    const loaded = await loadUserChart(key.slice(PREFIX.length));
    if (!loaded) continue;
    const saved = await get<StoredChart>(key);
    listed.push({ id: loaded.chart.id, savedAt: saved?.savedAt ?? "", name: loaded.chart.provenance.title, lakeName: loaded.chart.lake.name, hylakId: loaded.chart.lake.hylakId, contentHash: loaded.contentHash });
  }
  return listed.sort((a, b) => (a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : a.id.localeCompare(b.id)));
}

export async function deleteUserChart(id: string): Promise<void> {
  await del(chartKey(id));
}

/** At most this many charts travel with one project file. */
export const MAX_PROJECT_CHARTS = 16;

/** The charts an exported project must carry, so it opens on another device. */
export async function chartsForProject(config: Pick<ProjectConfigV1, "userDepthCharts">): Promise<UserChartBathymetryV1[]> {
  const ids = [...new Set(Object.values(config.userDepthCharts ?? {}).map((reference) => reference.id))].slice(0, MAX_PROJECT_CHARTS);
  const charts: UserChartBathymetryV1[] = [];
  for (const id of ids) {
    const loaded = await loadUserChart(id);
    if (loaded) charts.push(loaded.chart);
  }
  return charts;
}

/**
 * Save the charts that arrived with an imported project. Only charts the
 * project actually references are kept, so a file cannot fill this browser's
 * storage with charts nothing uses, and an unreadable one is skipped rather
 * than failing the import: that lake falls back to the survey providers.
 */
export async function saveProjectCharts(value: unknown, config: Pick<ProjectConfigV1, "userDepthCharts">): Promise<{ saved: number; skipped: number }> {
  if (!Array.isArray(value) || !value.length) return { saved: 0, skipped: 0 };
  const wanted = new Set(Object.values(config.userDepthCharts ?? {}).map((reference) => reference.id));
  let saved = 0;
  let skipped = 0;
  for (const item of value.slice(0, MAX_PROJECT_CHARTS)) {
    try {
      const chart = parseUserChartBathymetry(item);
      if (!wanted.has(chart.id)) { skipped += 1; continue; }
      await saveUserChart(chart);
      saved += 1;
    } catch (error) {
      console.warn("TopoStack: a depth chart in this project file could not be read.", error);
      skipped += 1;
    }
  }
  return { saved, skipped };
}
