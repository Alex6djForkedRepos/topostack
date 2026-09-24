import { addLabelObstacles, indexLabelLayer, type LabelLayerIndex } from "../../annotate/label-placement.js";
import { coveredLabelPoint } from "../../pipeline/piece-labels.js";
import { preparePolygons, type PreparedPolygons } from "../../primitives/geometry2d.js";
import type { GeometryIRV1, NestPartV1, OperationPath, ProjectConfigV1 } from "../../types.js";
import { polygonLabel } from "./parts.js";

/**
 * Nested sheets mix pieces of many layers, so every piece needs an id the
 * maker can read. Seam pieces already carry one from generation; this engraves
 * the rest (`L03`, `L03-2`) the same way, as a green assembly mark where the
 * layer above hides it. Pieces with no covered room, the top layer above all,
 * are named on the guide's sheet map instead. The IR is copied, not changed.
 */
export function withPartLabels(ir: GeometryIRV1, config: ProjectConfigV1, parts: NestPartV1[]): { ir: GeometryIRV1; omitted: string[] } {
  if (!config.showAssemblyLabels) return { ir, omitted: [] };
  const coverings = new Map<number, PreparedPolygons>();
  // Everything stacked above a layer, as generation computes it for piece ids.
  const coveringOf = (layerIndex: number) => {
    if (!coverings.has(layerIndex)) coverings.set(layerIndex, preparePolygons(ir.layers.slice(layerIndex + 1).flatMap((layer) => layer.polygons)));
    return coverings.get(layerIndex)!;
  };
  const layers = [...ir.layers];
  const indexes = new Map<number, LabelLayerIndex>();
  const omitted: string[] = [];
  const members = parts.flatMap((part) => part.members.flatMap(({ layerIndex, polygonIndexes }) => polygonIndexes.map((polygonIndex) => ({ layerIndex, polygonIndex }))));
  for (const { layerIndex, polygonIndex } of members) {
    const source = ir.layers[layerIndex];
    const polygon = source?.polygons[polygonIndex];
    if (!source || !polygon || source.pieces.some((piece) => piece.polygonIndex === polygonIndex)) continue;
    const text = polygonLabel(ir, layerIndex, polygonIndex);
    const layer = layers[layerIndex] === source ? (layers[layerIndex] = { ...source, markings: [...source.markings] }) : layers[layerIndex]!;
    let index = indexes.get(layerIndex);
    if (!index) indexes.set(layerIndex, index = indexLabelLayer(layer.polygons, layer.markings));
    const point = coveredLabelPoint(text, config, index, polygon, coveringOf(layerIndex));
    if (!point) {
      omitted.push(text);
      continue;
    }
    const marking: OperationPath = { id: `piece-${text}-label`, operation: "engrave", kind: "guide", points: [point], label: text, textStyle: config.textStyle };
    layer.markings.push(marking);
    addLabelObstacles(index, [marking]);
  }
  return { ir: { ...ir, layers }, omitted };
}
