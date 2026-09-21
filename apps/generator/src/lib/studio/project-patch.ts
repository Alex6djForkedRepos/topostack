import type { ProjectConfigV1 } from "@topostack/core";

/** Top-level project keys whose values differ, compared structurally. */
export function changedProjectKeys(from: ProjectConfigV1, to: ProjectConfigV1): Array<keyof ProjectConfigV1> {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]) as Set<keyof ProjectConfigV1>;
  return [...keys].filter((key) => from[key] !== to[key] && JSON.stringify(from[key]) !== JSON.stringify(to[key]));
}

/** The edit relative to the project the current preview source was built for. */
export function projectPatch(from: ProjectConfigV1, to: ProjectConfigV1): Partial<ProjectConfigV1> {
  return Object.fromEntries(changedProjectKeys(from, to).map((key) => [key, to[key]])) as Partial<ProjectConfigV1>;
}
