import { activePlaque, groundWidthMFor, NORTH_ARROW_MIN_SIZE_MM, PLAQUE_MAX_SIZE_MM, PLAQUE_MIN_SIZE_MM, northArrowCenter, northArrowFootprint, northArrowMarkings, northArrowPlacementAt, plaqueBox, plaqueMarkings, plaquePlacementAt, scaleBarCenter, scaleBarFootprint, scaleBarMarkings, scaleBarPlacementAt, type PlaqueV1, type GeometryIRV1, type OperationPath, type Point2D, type ProjectConfigV1 } from "@topostack/core";
import { northArrowMaximumMm, plaqueSettings } from "$lib/studio/project-edits";

/**
 * Everything placement mode can move. Each entry reads and writes its position
 * through ordinary project fields, so a placement session is only a project
 * patch: previews evaluate the entries against the patched project, and Done
 * hands the patch to the normal generation pipeline, which bakes the item into
 * whichever sheets it lands on. See docs/placement.md.
 */
export type PlaceableId = "north" | "plaque" | "scale";

/** Facts from the generated preview that some placeables are sized by. */
export interface PlacementContext {
  /** Ground width of the mapped area, which sets the scale bar's length. */
  groundWidthM: number;
}

export function placementContext(geometry: Pick<GeometryIRV1, "bounds">): PlacementContext {
  return { groundWidthM: groundWidthMFor(geometry.bounds) };
}

export interface Placeable {
  id: PlaceableId;
  label: string;
  available(project: ProjectConfigV1): boolean;
  /** Center in artwork millimeters, origin at the artwork center, y down. */
  center(project: ProjectConfigV1, context: PlacementContext): Point2D;
  /** Closed ring of the reserved area; the hit and focus target. */
  outline(project: ProjectConfigV1, context: PlacementContext): Point2D[];
  /** The engraving itself, from the same core functions generation uses. */
  markings(project: ProjectConfigV1, context: PlacementContext): OperationPath[];
  /** The patch that puts the center at `center`, kept inside the material. */
  moveTo(project: ProjectConfigV1, center: Point2D, context: PlacementContext): PlacementPatch;
  /** Id prefixes of the generated markings, hidden in the backdrop while a draft is shown. */
  bakedMarkingPrefixes: readonly string[];
  /** Present when the placeable can be resized in place: which size, its range and the patch that sets it. */
  resize?: PlaceableSize;
}

export interface PlaceableSize {
  /** What the size measures, for the toolbar readout ("Diameter", "Letter height"). */
  label: string;
  value(project: ProjectConfigV1): number;
  range(project: ProjectConfigV1): { min: number; max: number };
  /** Keyboard step in millimeters. */
  step: number;
  set(project: ProjectConfigV1, sizeMm: number): PlacementPatch;
}

/** Matches the clearance core keeps between an anchored annotation and the crop edge. */
const PLAQUE_HANDLE_PAD_MM = 3;

export const PLACEABLES: Record<PlaceableId, Placeable> = {
  north: {
    id: "north",
    label: "North arrow",
    available: (project) => project.showNorthArrow,
    center: northArrowCenter,
    outline: northArrowFootprint,
    markings: northArrowMarkings,
    moveTo: (project, center) => ({ northArrowPlacement: northArrowPlacementAt(project, center) }),
    bakedMarkingPrefixes: ["north-"],
    resize: {
      label: "Diameter",
      value: (project) => project.northArrowSizeMm,
      range: (project) => ({ min: NORTH_ARROW_MIN_SIZE_MM, max: northArrowMaximumMm(project.widthMm, project.heightMm) }),
      step: 1,
      set: (_project, sizeMm) => ({ northArrowSizeMm: sizeMm }),
    },
  },
  plaque: {
    id: "plaque",
    label: "Title",
    available: (project) => activePlaque(project) !== undefined,
    center: (project) => plaqueBox(project)?.center ?? { x: 0, y: 0 },
    outline: (project) => {
      // The text block plus the edge clearance placement keeps, not the wider
      // knockout padding, so the handle never pokes past the material.
      const box = plaqueBox(project);
      if (!box) return [];
      const pad = Math.min((project.plaque?.sizeMm ?? 0) * 0.5, PLAQUE_HANDLE_PAD_MM);
      const left = box.center.x - box.width / 2 - pad; const right = box.center.x + box.width / 2 + pad;
      const top = box.center.y - box.height / 2 - pad; const bottom = box.center.y + box.height / 2 + pad;
      return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }, { x: left, y: top }];
    },
    markings: plaqueMarkings,
    moveTo: (project, center) => {
      const placement = plaquePlacementAt(project, center);
      return placement ? { plaque: { placement } } : {};
    },
    bakedMarkingPrefixes: ["plaque-"],
    resize: {
      label: "Letter height",
      value: (project) => project.plaque?.sizeMm ?? PLAQUE_MIN_SIZE_MM,
      range: () => ({ min: PLAQUE_MIN_SIZE_MM, max: PLAQUE_MAX_SIZE_MM }),
      step: 0.5,
      set: (_project, sizeMm) => ({ plaque: { sizeMm } }),
    },
  },
  scale: {
    id: "scale",
    label: "Scale bar",
    available: (project) => project.showScaleBar,
    center: (project, { groundWidthM }) => scaleBarCenter(project, groundWidthM),
    outline: (project, { groundWidthM }) => scaleBarFootprint(project, groundWidthM),
    markings: (project, { groundWidthM }) => scaleBarMarkings(project, groundWidthM),
    moveTo: (project, center, { groundWidthM }) => ({ scaleBarPlacement: scaleBarPlacementAt(project, groundWidthM, center) }),
    bakedMarkingPrefixes: ["scale-"],
  },
};

export const PLACEABLE_ORDER: readonly PlaceableId[] = ["north", "plaque", "scale"];

/** Only fields owned by placement, so unrelated live edits cannot be overwritten. */
export type PlacementPatch = Partial<Pick<ProjectConfigV1, "northArrowPlacement" | "northArrowSizeMm" | "scaleBarPlacement">> & {
  plaque?: Partial<Pick<PlaqueV1, "placement" | "sizeMm">>;
};

export function placementPatch(project: ProjectConfigV1, draft: PlacementPatch): Partial<ProjectConfigV1> {
  const { plaque, ...rest } = draft;
  return { ...rest, ...(plaque ? { plaque: plaqueSettings(project, plaque) } : {}) };
}

function mergeDraft(draft: PlacementPatch, patch: PlacementPatch): PlacementPatch {
  return { ...draft, ...patch, ...(patch.plaque ? { plaque: { ...draft.plaque, ...patch.plaque } } : {}) };
}

export interface PlacementSession {
  selected: PlaceableId;
  /** Uncommitted position changes, as a project patch. */
  draft: PlacementPatch;
}

export function draftProject(project: ProjectConfigV1, session: PlacementSession): ProjectConfigV1 {
  return { ...project, ...placementPatch(project, session.draft) };
}

/** Placeables shown in a session, in tab order. */
export function availablePlaceables(project: ProjectConfigV1): Placeable[] {
  return PLACEABLE_ORDER.map((id) => PLACEABLES[id]).filter((placeable) => placeable.available(project));
}

/** The session with `id` moved to `center`, merged into the existing draft. */
export function movePlaceable(project: ProjectConfigV1, session: PlacementSession, id: PlaceableId, center: Point2D, context: PlacementContext): PlacementSession {
  const patch = PLACEABLES[id].moveTo(draftProject(project, session), center, context);
  return { selected: id, draft: mergeDraft(session.draft, patch) };
}

/**
 * The session with `id` resized to `sizeMm`, clamped to its range, about its
 * current center: the anchored travel depends on the size, so the placement
 * is recomputed for the new size rather than kept.
 */
export function resizePlaceable(project: ProjectConfigV1, session: PlacementSession, id: PlaceableId, sizeMm: number, context: PlacementContext): PlacementSession {
  const placeable = PLACEABLES[id];
  if (!placeable.resize || !Number.isFinite(sizeMm)) return session;
  const draft = draftProject(project, session);
  const { min, max } = placeable.resize.range(draft);
  const clamped = Math.min(max, Math.max(min, Math.round(sizeMm * 10) / 10));
  const center = placeable.center(draft, context);
  const sizePatch = placeable.resize.set(draft, clamped);
  const sized = { ...draft, ...placementPatch(draft, sizePatch) };
  return { selected: id, draft: mergeDraft(mergeDraft(session.draft, sizePatch), placeable.moveTo(sized, center, context)) };
}

/** Prefixes to hide in a backdrop while these placeables are drawn as drafts. */
export function hiddenMarkingPrefixes(project: ProjectConfigV1): string[] {
  return availablePlaceables(project).flatMap((placeable) => placeable.bakedMarkingPrefixes);
}

export function hiddenByPrefix(id: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => id.startsWith(prefix));
}
