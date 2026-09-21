import { describe, expect, it } from "vitest";
import { buildFabricationPackage, DEFAULT_PROJECT, generateGeometry, labelDimensions, labelLineSegments, layerToSvg } from "../index.js";
import { placeElevationLabel } from "../annotate/label-placement.js";
import { pointInRing, realSource } from "../test-support/sources.js";

describe("labels and fonts", () => {
  it("uses distinct metric glyphs and switches labels and documentation to imperial", async () => {
    expect(labelDimensions("m").width).toBeGreaterThan(labelDimensions("k").width);
    const metric = generateGeometry(DEFAULT_PROJECT, realSource());
    const metricLabels = metric.layers.flatMap((layer) => layer.markings).filter((marking) => marking.label).map((marking) => marking.label ?? "");
    expect(metricLabels.some((label) => /\d m$/.test(label))).toBe(true);
    expect(metric.layers[0]?.markings.find((marking) => marking.id === "scale-label")?.label).toMatch(/\d (m|km)$/);

    const imperialProject = { ...DEFAULT_PROJECT, units: "imperial" as const };
    const imperial = generateGeometry(imperialProject, realSource(imperialProject));
    const imperialLabels = imperial.layers.flatMap((layer) => layer.markings).filter((marking) => marking.label).map((marking) => marking.label ?? "");
    expect(imperial.units).toBe("imperial");
    expect(imperialLabels.some((label) => /\d ft$/.test(label))).toBe(true);
    expect(imperial.layers[0]?.markings.find((marking) => marking.id === "scale-label")?.label).toMatch(/\d (ft|mi)$/);
    const fabrication = buildFabricationPackage(imperial, imperialProject);
    expect(await fabrication.files.find((file) => file.filename === "README.txt")?.blob.text()).toContain(" in each");
    expect(await fabrication.files.find((file) => file.filename.endsWith("assembly-guide.html"))?.blob.text()).toMatch(/\d ft – [\d,]+ ft/);
  });

  it("renders distinct scalable fabrication fonts and propagates the selected style", () => {
    const technical = { font: "technical" as const, sizeMm: 3.1 };
    const rounded = { font: "rounded" as const, sizeMm: 3.1 };
    const stencil = { font: "stencil" as const, sizeMm: 3.1 };
    const technicalSegments = labelLineSegments("123m", { x: 0, y: 0 }, 0, 0, 0, technical);
    const roundedSegments = labelLineSegments("123m", { x: 0, y: 0 }, 0, 0, 0, rounded);
    const stencilSegments = labelLineSegments("123m", { x: 0, y: 0 }, 0, 0, 0, stencil);
    expect(roundedSegments).not.toEqual(technicalSegments);
    expect(stencilSegments).not.toEqual(technicalSegments);
    expect(technicalSegments.every(({ start, end }) => start.y === end.y)).toBe(true);
    expect(roundedSegments.some(({ start, end }) => start.y !== end.y)).toBe(true);
    expect(stencilSegments.length).toBeGreaterThan(roundedSegments.length);
    expect(labelDimensions("123m", { ...technical, sizeMm: 6.2 }).width).toBeCloseTo(labelDimensions("123m", technical).width * 2);
    expect(labelDimensions("123m", { ...technical, sizeMm: 6.2 }).height).toBe(6.2);

    const project = { ...DEFAULT_PROJECT, textStyle: { font: "rounded" as const, sizeMm: 4.2 } };
    const source = realSource(project);
    source.markings = [{ id: "summit", kind: "label", operation: "engrave", points: [{ x: 10, y: 10 }], label: "Summit 1", elevationM: source.elevation.min }];
    const result = generateGeometry(project, source);
    const labels = result.layers.flatMap((layer) => layer.markings).filter((marking) => marking.label && !marking.id.startsWith("north-"));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.every((marking) => marking.textStyle?.font === "rounded" && marking.textStyle.sizeMm === 4.2)).toBe(true);
    expect(layerToSvg(result, result.layers[0]!)).not.toContain("<text");
  });

  it("coordinates elevation labels across the stack without sacrificing valid exposed faces", () => {
    const project = { ...DEFAULT_PROJECT, showRoads: false, showWater: false, showScaleBar: false, showNorthArrow: false };
    const bare = generateGeometry({ ...project, showElevationLabels: false }, realSource(project));
    const independent = bare.layers.map((layer, index) => {
      const elevation = Math.round(layer.elevationM);
      for (const label of [`${elevation} m`, `${elevation}m`, `${elevation}`]) {
        const placement = placeElevationLabel(label, project, layer, bare.layers[index + 1]);
        if (placement) return { label, ...placement };
      }
      return undefined;
    });
    const coordinated = generateGeometry(project, realSource(project)).layers.map((layer) => {
      const marking = layer.markings.find((item) => item.id.startsWith("elevation-"));
      return marking?.label && marking.points[0] ? { label: marking.label, point: marking.points[0], rotationRad: marking.labelRotationRad ?? 0 } : undefined;
    });
    const center = (item: NonNullable<(typeof coordinated)[number]>) => {
      const dimensions = labelDimensions(item.label, project.textStyle);
      const cosine = Math.cos(item.rotationRad); const sine = Math.sin(item.rotationRad);
      return { x: item.point.x + dimensions.width / 2 * cosine - dimensions.height / 2 * sine, y: item.point.y + dimensions.width / 2 * sine + dimensions.height / 2 * cosine };
    };
    const drift = (items: typeof coordinated) => items.slice(1).reduce((total, item, index) => {
      const prior = items[index];
      if (!item || !prior) return total;
      const a = center(prior); const b = center(item);
      return total + Math.hypot(a.x - b.x, a.y - b.y);
    }, 0);
    expect(coordinated.filter(Boolean)).toHaveLength(independent.filter(Boolean).length);
    expect(drift(coordinated)).toBeLessThanOrEqual(drift(independent) + 1e-6);
  });

  it("repairs an elevation label position that collides with an engraved line", () => {
    const project = {
      ...DEFAULT_PROJECT,
      showWater: false,
      showNorthArrow: false,
      showScaleBar: false,
      elevationLabelPosition: { x: 0, y: 0 },
    };
    const source = realSource(project);
    source.markings = [{
      id: "center-road",
      kind: "road",
      operation: "engrave",
      elevationM: source.elevation.min,
      points: [{ x: -project.widthMm / 2, y: 0 }, { x: project.widthMm / 2, y: 0 }],
    }];
    const result = generateGeometry(project, source);
    const marking = result.layers[0]?.markings.find((item) => item.id === "elevation-0");
    expect(marking?.label).toBeTruthy();
    const origin = marking?.points[0];
    const dimensions = labelDimensions(marking?.label ?? "");
    expect(origin).toBeTruthy();
    expect(origin && (origin.y > 0 || origin.y + dimensions.height < 0)).toBe(true);
  });

  it("keeps repaired label outlines inside circular material", () => {
    const project = { ...DEFAULT_PROJECT, cropShape: "circle" as const, widthMm: 200, heightMm: 200 };
    const result = generateGeometry(project, realSource(project));
    const labels = result.layers.flatMap((layer) => layer.markings).filter((item) => item.id.startsWith("elevation-"));
    expect(labels.length).toBeGreaterThan(0);
    for (const marking of labels) {
      const strokes = labelLineSegments(marking.label ?? "", marking.points[0]!, 0, 0, marking.labelRotationRad);
      expect(strokes.flatMap(({ start, end }) => [start, end]).every((point) => Math.hypot(point.x, point.y) < 100)).toBe(true);
    }
  });

  it("keeps elevation labels on exposed faces with their bottom edge downslope", () => {
    const result = generateGeometry(DEFAULT_PROJECT, realSource());
    const labels = result.layers.flatMap((layer, index) => layer.markings
      .filter((marking) => marking.id.startsWith("elevation-"))
      .map((marking) => ({ marking, layer, coveringLayer: result.layers[index + 1] })));
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some(({ marking }) => Math.abs(marking.labelRotationRad ?? 0) > 0.05)).toBe(true);
    for (const { marking, layer, coveringLayer } of labels) {
      expect(marking.label).not.toMatch(/L\d/);
      const rotation = marking.labelRotationRad ?? 0;
      const strokes = labelLineSegments(marking.label ?? "", marking.points[0]!, 0, 0, rotation, marking.textStyle);
      const points = strokes.flatMap(({ start, end }) => [start, end]);
      expect(points.every((point) => layer.polygons.some((polygon) => pointInRing(point, polygon.outer) && !polygon.holes.some((hole) => pointInRing(point, hole))))).toBe(true);
      expect(points.every((point) => !coveringLayer?.polygons.some((polygon) => pointInRing(point, polygon.outer) && !polygon.holes.some((hole) => pointInRing(point, hole))))).toBe(true);
      const dimensions = labelDimensions(marking.label ?? "", marking.textStyle);
      const origin = marking.points[0]!;
      const center = {
        x: origin.x + dimensions.width / 2 * Math.cos(rotation) - dimensions.height / 2 * Math.sin(rotation),
        y: origin.y + dimensions.width / 2 * Math.sin(rotation) + dimensions.height / 2 * Math.cos(rotation),
      };
      const down = { x: -Math.sin(rotation), y: Math.cos(rotation) };
      const probeDistance = dimensions.height / 2 + 1.7;
      const bottomProbe = { x: center.x + down.x * probeDistance, y: center.y + down.y * probeDistance };
      const topProbe = { x: center.x - down.x * probeDistance, y: center.y - down.y * probeDistance };
      const inside = (point: { x: number; y: number }, polygons = layer.polygons) => polygons.some((polygon) => pointInRing(point, polygon.outer) && !polygon.holes.some((hole) => pointInRing(point, hole)));
      // The text sits just inside the contour of the layer it describes: its
      // top points into that layer and its bottom crosses that same boundary
      // toward lower terrain. It must also remain clear of the next layer.
      expect(inside(topProbe)).toBe(true);
      expect(inside(bottomProbe)).toBe(false);
      expect(inside(center, coveringLayer?.polygons ?? [])).toBe(false);
    }
  });

  it("places single-point labels and renders score-operation labels", () => {
    // Nesting disabled so base-layer cavities cannot swallow the test points.
    const project = { ...DEFAULT_PROJECT, optimizeMaterialUse: false };
    const source = realSource(project);
    source.markings = [
      { id: "summit", kind: "label", operation: "engrave", points: [{ x: 10, y: 10 }], label: "1234", elevationM: source.elevation.min },
      { id: "river", kind: "water", operation: "score", points: [{ x: -20, y: 30 }, { x: 20, y: 30 }], label: "12", elevationM: source.elevation.min },
    ];
    const result = generateGeometry(project, source);
    const base = result.layers[0]!;
    expect(base.markings.find((marking) => marking.id === "summit-0-0-label")?.label).toBe("1234");
    const riverLabel = base.markings.find((marking) => marking.id === "river-0-0-label");
    expect(riverLabel?.operation).toBe("score");
    const scoreGroup = layerToSvg(result, base).match(/data-operation="SCORE"[^>]*>(.*?)<\/g>/s)?.[1] ?? "";
    expect(scoreGroup).toContain('id="river-0-0-label"');
  });
});
