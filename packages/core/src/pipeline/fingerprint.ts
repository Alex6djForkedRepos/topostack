import type { ProjectConfigV1 } from "../types.js";


function stableProjectValue(config: ProjectConfigV1): unknown {
  const { explodedPreview: _previewOnly, name: _packageMetadata, ...fabricationConfig } = config;
  return {
    ...fabricationConfig,
    // A marker's or path's name is what the maker calls it, never anything the
    // geometry reads, so renaming one must not restate the design. Projects
    // without names hash exactly as they did before names existed.
    markers: config.markers.map(({ name: _label, ...marker }) => marker),
    customLines: config.customLines.map(({ name: _label, ...line }) => line),
    // Likewise an uploaded icon's name; its shapes are the design.
    markerIcons: config.markerIcons?.map(({ name: _label, ...icon }) => icon),
    customGraphics: config.customGraphics?.map(({ name: _label, ...graphic }) => graphic),
    location: { ...config.location, bounds: config.location.bounds ? { ...config.location.bounds } : undefined },
  };
}

// Canonical JSON: object keys sorted recursively so value-identical configs
// hash identically regardless of key insertion order.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function projectFingerprint(config: ProjectConfigV1): string {
  const input = stableStringify(stableProjectValue(config));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `v9-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
