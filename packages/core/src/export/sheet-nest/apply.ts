import { ringBounds } from "../../primitives/geometry2d.js";
import type { GeometryIRV1, NestPartV1, NestPlacementV1, SheetNestPlanV1, SheetNestSheetV1 } from "../../types.js";
import type { FabricationPanel } from "../panel-layout.js";

export interface NestedPart {
  part: NestPartV1;
  placement: NestPlacementV1;
  /** The part's polygons as a panel in model coordinates, so every panel writer can draw it. */
  panel: FabricationPanel;
}

export interface NestedSheet {
  /** The sheet as a panel: sheet coordinates from (0, 0), holding every layer that has a part on it. */
  panel: FabricationPanel;
  parts: NestedPart[];
  sheet: SheetNestSheetV1;
}

function includedOf(part: NestPartV1): Map<number, Set<number>> {
  return new Map(part.members.map(({ layerIndex, polygonIndexes }) => [layerIndex, new Set(polygonIndexes)]));
}

/**
 * The panels a nested export draws: one per stock sheet, each made of the
 * parts placed on it. Parts keep their model coordinates; the writers place
 * each one with its own transform.
 */
export function nestedSheets(ir: GeometryIRV1, parts: NestPartV1[], plan: SheetNestPlanV1): NestedSheet[] {
  const partsById = new Map(parts.map((part) => [part.id, part]));
  return plan.sheets.map((sheet, sheetIndex) => {
    const placed = sheet.placements.flatMap((placement): NestedPart[] => {
      const part = partsById.get(placement.partId);
      if (!part) return [];
      const layerIndexes = part.members.map((member) => member.layerIndex);
      const bounds = ringBounds(part.outline);
      return [{ part, placement, panel: { rootLayerIndex: part.rootLayerIndex, layerIndexes, included: includedOf(part), ...bounds } }];
    });
    const included = new Map<number, Set<number>>();
    for (const { part } of placed) {
      for (const { layerIndex, polygonIndexes } of part.members) included.set(layerIndex, new Set([...(included.get(layerIndex) ?? []), ...polygonIndexes]));
    }
    const layerIndexes = [...included.keys()].sort((left, right) => left - right);
    return {
      panel: {
        rootLayerIndex: layerIndexes[0] ?? 0,
        layerIndexes,
        included,
        sheetIndex: sheetIndex,
        minX: 0,
        minY: 0,
        maxX: plan.settings.sheetWidthMm,
        maxY: plan.settings.sheetHeightMm,
      },
      parts: placed,
      sheet,
    };
  });
}

/** SVG `matrix()` for a placement. Rotation terms keep nine decimals: three would move a far corner by tenths of a millimetre. */
export function placementMatrix(placement: Pick<NestPlacementV1, "rotationDeg" | "xMm" | "yMm">): string {
  const radians = (placement.rotationDeg * Math.PI) / 180;
  const precise = (value: number) => {
    const rounded = Number(value.toFixed(9));
    return Object.is(rounded, -0) ? "0" : String(rounded);
  };
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return `matrix(${precise(cos)} ${precise(sin)} ${precise(-sin)} ${precise(cos)} ${precise(placement.xMm)} ${precise(placement.yMm)})`;
}

/** Suffixes every id in an SVG fragment, so repeated layer groups stay unique on a sheet. */
export function suffixIds(fragment: string, suffix: string): string {
  return fragment.replace(/ id="([^"]*)"/g, (_, id: string) => ` id="${id}${suffix}"`);
}
