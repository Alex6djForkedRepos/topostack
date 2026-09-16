/** Contract shared by the browser, gateway, and offline survey provisioning. */
export interface SurveySource {
  id: string;
  name: string;
  url: string;
  license: string;
  bounds: [number, number, number, number];
  encoding: "depth-terrarium-v1" | "elevation-terrarium-v1";
  maxZoom: number;
}

/** Fail at startup/build time rather than silently selecting the wrong decoder. */
export function validateSurveyCatalog(value: unknown): { sources: SurveySource[] } {
  if (!value || typeof value !== "object" || !("sources" in value) || !Array.isArray(value.sources)) {
    throw new Error("Survey catalog must contain a sources array.");
  }
  const ids = new Set<string>();
  const sources = value.sources.map((item: unknown): SurveySource => {
    if (!item || typeof item !== "object") throw new Error("Invalid survey source.");
    const source = item as Record<string, unknown>;
    const text = (field: string): string => {
      const value = source[field];
      if (typeof value !== "string" || !value.trim()) throw new Error(`Survey source requires ${field}.`);
      return value;
    };
    const id = text("id");
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*-v[1-9]\d*$/.test(id) || ids.has(id)) throw new Error(`Invalid or duplicate survey ID: ${id}`);
    ids.add(id);
    const url = text("url");
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error(`Invalid source URL: ${id}`);
    const bounds = source.bounds;
    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every((n: unknown) => typeof n === "number" && Number.isFinite(n))) throw new Error(`Invalid survey bounds: ${id}`);
    const [west, south, east, north] = bounds as [number, number, number, number];
    if (west < -180 || east > 180 || south < -85.0511 || north > 85.0511 || west >= east || south >= north) throw new Error(`Invalid survey bounds: ${id}`);
    const encoding = source.encoding;
    if (encoding !== "depth-terrarium-v1" && encoding !== "elevation-terrarium-v1") throw new Error(`Unsupported survey encoding: ${id}`);
    const maxZoom = source.maxZoom;
    if (typeof maxZoom !== "number" || !Number.isInteger(maxZoom) || maxZoom < 0 || maxZoom > 15) throw new Error(`Invalid survey maxZoom: ${id}`);
    return { id, name: text("name"), url, license: text("license"), bounds: [west, south, east, north], encoding, maxZoom };
  });
  return { sources };
}
