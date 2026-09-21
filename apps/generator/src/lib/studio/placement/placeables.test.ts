import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT, generateGeometry, type ProjectConfigV1 } from "@topostack/core";
import { createSamplePreviewSource } from "$lib/domain/sample-preview";
import { availablePlaceables, draftProject, hiddenByPrefix, hiddenMarkingPrefixes, movePlaceable, PLACEABLES, PLACEABLE_ORDER, resizePlaceable, type PlacementSession } from "./placeables";

const context = { groundWidthM: 20_000 };
import { placementFrustum, placementViewBox } from "./viewport";

const project: ProjectConfigV1 = { ...DEFAULT_PROJECT, plaque: { enabled: true, text: "Crater Lake", sizeMm: 6, placement: { anchor: "bottom-left", offset: { x: 0, y: 0 } } } };

describe("placeables", () => {
  it("moves each placeable to the dropped center and draws it there", () => {
    for (const id of PLACEABLE_ORDER) {
      const session = movePlaceable(project, { selected: id, draft: {} }, id, { x: 12, y: -9 }, context);
      const moved = draftProject(project, session);
      const center = PLACEABLES[id].center(moved, context);
      expect(center.x).toBeCloseTo(12, 4);
      expect(center.y).toBeCloseTo(-9, 4);
      const points = PLACEABLES[id].markings(moved, context).flatMap((marking) => marking.points);
      const mean = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
      expect(Math.abs(mean.x - 12)).toBeLessThan(id === "north" ? 3 : 40);
      expect(Math.abs(mean.y + 9)).toBeLessThan(10);
    }
  });

  it("merges moves into one draft and leaves the project alone", () => {
    let session: PlacementSession = { selected: "north", draft: {} };
    session = movePlaceable(project, session, "north", { x: 5, y: 5 }, context);
    session = movePlaceable(project, session, "plaque", { x: -5, y: 0 }, context);
    expect(Object.keys(session.draft).sort()).toEqual(["northArrowPlacement", "plaque"]);
    expect(session.selected).toBe("plaque");
    expect(project.northArrowPlacement).toEqual(DEFAULT_PROJECT.northArrowPlacement);
    expect(draftProject(project, session).plaque?.text).toBe("Crater Lake");
  });

  it("resizes about the current center, within each item's range", () => {
    let session: PlacementSession = movePlaceable(project, { selected: "north", draft: {} }, "north", { x: 20, y: -10 }, context);
    session = resizePlaceable(project, session, "north", 40, context);
    let draft = draftProject(project, session);
    expect(draft.northArrowSizeMm).toBe(40);
    expect(PLACEABLES.north.center(draft, context).x).toBeCloseTo(20, 4);
    expect(PLACEABLES.north.center(draft, context).y).toBeCloseTo(-10, 4);
    session = resizePlaceable(project, session, "north", 1, context);
    expect(draftProject(project, session).northArrowSizeMm).toBe(12);
    session = resizePlaceable(project, session, "plaque", 99, context);
    draft = draftProject(project, session);
    expect(draft.plaque?.sizeMm).toBe(30);
    expect(draft.plaque?.text).toBe("Crater Lake");
    // The scale bar's length follows the map scale, so it only moves.
    expect(PLACEABLES.scale.resize).toBeUndefined();
    expect(resizePlaceable(project, session, "scale", 50, context)).toBe(session);
  });

  it("offers only switched-on placeables", () => {
    expect(availablePlaceables(project).map((placeable) => placeable.id)).toEqual(["north", "plaque", "scale"]);
    expect(availablePlaceables({ ...project, showNorthArrow: false, showScaleBar: false, plaque: { ...project.plaque!, enabled: false } })).toEqual([]);
    expect(availablePlaceables({ ...project, showScaleBar: false, plaque: { ...project.plaque!, text: "  " } }).map((placeable) => placeable.id)).toEqual(["north"]);
  });

  it("hides exactly the generated markings of the placeables", () => {
    const geometry = generateGeometry({ ...project, outputMode: "engraving" }, createSamplePreviewSource());
    const prefixes = hiddenMarkingPrefixes(project);
    const markings = geometry.layers.flatMap((layer) => layer.markings);
    const hidden = markings.filter((marking) => hiddenByPrefix(marking.id, prefixes));
    expect(hidden.some((marking) => marking.id.startsWith("north-"))).toBe(true);
    expect(hidden.some((marking) => marking.id.startsWith("plaque-"))).toBe(true);
    expect(hidden.some((marking) => marking.id.startsWith("scale-"))).toBe(true);
    expect(markings.filter((marking) => !hiddenByPrefix(marking.id, prefixes)).some((marking) => /north|plaque|scale/.test(marking.id))).toBe(false);
  });
});

describe("placement viewport", () => {
  it("frames the artwork like an SVG viewBox with xMidYMid meet", () => {
    const box = placementViewBox(200, 100, 10);
    expect(box).toEqual({ x: -110, y: -60, width: 220, height: 120 });
    // A tall stage fits the width; the height gains room.
    expect(placementFrustum(box, 440, 600)).toEqual({ halfWidth: 110, halfHeight: 150 });
    // A wide stage fits the height.
    expect(placementFrustum(box, 1200, 240)).toEqual({ halfWidth: 300, halfHeight: 60 });
  });
});
