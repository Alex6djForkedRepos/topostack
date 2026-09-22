import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeChartDepths } from "@topostack/data-contracts/chart-bathymetry";
import { chartRecord, controlPoints, parseChartManifest, traceChart } from "../lib/depth-charts.mjs";

const manifestUrl = new URL("../data/depth-charts.json", import.meta.url);

/** A nested ring on a 1000x800 page, `fraction` of the shore's size. */
const ring = (fraction, count = 120) => Array.from({ length: count }, (_, index) => {
  const angle = (2 * Math.PI * index) / count;
  const radius = 300 * fraction * (1 + 0.15 * Math.sin(3 * angle));
  return [500 + 1.3 * radius * Math.cos(angle), 400 + radius * Math.sin(angle)];
});

function vectorChart(overrides = {}) {
  return {
    id: "synthetic-lake-chart",
    title: "Synthetic lake",
    source: { url: "https://example.org/lake.pdf", sha256: "a".repeat(64) },
    license: { attestation: "public-domain" },
    input: { kind: "pdf-vector" },
    units: "ft",
    trace: { contourStyles: ["#333333/0.50"], labels: "depth", interval: 10 },
    water: { fillStyles: ["#bee8ff"] },
    // Page units to ground: 1 unit is about 2 m around 45 N, 80 W.
    georef: { controlPoints: [{ x: 0, y: 0, lon: -80, lat: 45.0072 }, { x: 1000, y: 0, lon: -79.9746, lat: 45.0072 }, { x: 0, y: 800, lon: -80, lat: 44.9928 }] },
    grid: { resolutionM: 10 },
    ...overrides,
  };
}

function vectorPage() {
  const fractions = [0.8, 0.55, 0.3];
  const paths = fractions.map((fraction) => ({ stroke: "#333333", lineWidth: 0.5, dashed: false, points: ring(fraction), closed: true }));
  paths.push({ fill: "#bee8ff", lineWidth: 0, dashed: false, points: ring(1), closed: true });
  const labelOn = (fraction, text) => {
    const [x, y] = ring(fraction)[0];
    return { text, x, y, angle: Math.PI / 2, size: 8, width: 12 };
  };
  return { width: 1000, height: 800, paths, texts: [labelOn(0.8, "10"), labelOn(0.3, "30")] };
}

test("the committed manifest is valid and pins every source", async () => {
  const charts = parseChartManifest(JSON.parse(await readFile(manifestUrl, "utf8")));
  assert.ok(charts.length >= 1);
  for (const chart of charts) assert.match(chart.source.sha256, /^[a-f0-9]{64}$/);
});

test("manifest validation names the chart and the problem", () => {
  const broken = (patch) => ({ charts: [{ ...vectorChart(), ...patch }] });
  assert.throws(() => parseChartManifest({}), /charts list/);
  assert.throws(() => parseChartManifest(broken({ id: "Bad" })), /Bad: id must/);
  assert.throws(() => parseChartManifest({ charts: [vectorChart(), vectorChart()] }), /listed twice/);
  assert.throws(() => parseChartManifest(broken({ source: { url: "http://example.org/x.pdf", sha256: "a".repeat(64) } })), /https url/);
  assert.throws(() => parseChartManifest(broken({ license: { attestation: "found-online" } })), /attestation/);
  assert.throws(() => parseChartManifest(broken({ input: { kind: "jpeg" } })), /input kind/);
  assert.throws(() => parseChartManifest(broken({ units: "yd" })), /units/);
  assert.throws(() => parseChartManifest(broken({ trace: { labels: "elevation", contourStyles: ["x"] } })), /trace.surface/);
  assert.throws(() => parseChartManifest(broken({ trace: { labels: "depth" } })), /contourStyles/);
  assert.throws(() => parseChartManifest(broken({ georef: { controlPoints: [{ x: 0, y: 0, lon: 0, lat: 0 }] } })), /three control points/);
  assert.throws(() => parseChartManifest(broken({ georef: { crs: "EPSG:4326", controlPoints: [{ x: 0, y: 0, lon: 0, lat: 0 }, { x: 1, y: 0, lon: 0, lat: 0 }, { x: 0, y: 1, lon: 0, lat: 0 }] } })), /easting, northing/);
  assert.throws(() => parseChartManifest(broken({ water: {} })), /fillStyles/);
  assert.throws(() => parseChartManifest(broken({ grid: { resolutionM: 0 } })), /resolutionM/);
});

test("projected control points convert to lon/lat, as for State Plane grid ticks", async () => {
  const [cedarCreek] = parseChartManifest(JSON.parse(await readFile(manifestUrl, "utf8")));
  const [corner] = controlPoints(cedarCreek.georef);
  assert.ok(Math.abs(corner.lon - -96.19997) < 1e-4 && Math.abs(corner.lat - 32.1904) < 1e-4, JSON.stringify(corner));
  assert.deepEqual(controlPoints({ controlPoints: [{ x: 1, y: 2, lon: 3, lat: 4 }] }), [{ x: 1, y: 2, lon: 3, lat: 4 }]);
});

test("a vector chart becomes a valid record with depths, a grid and a QA report", () => {
  const chart = vectorChart();
  const traced = traceChart(chart, { page: vectorPage() });
  const { record, report } = chartRecord(chart, traced, { fileSha256: "b".repeat(64), tool: "chart-trace@test" });
  assert.equal(record.id, chart.id);
  assert.deepEqual(record.labels, { kind: "depth" });
  assert.equal(record.intervalM, 10 * 0.3048);
  assert.deepEqual(record.contours.map((contour) => Math.round(contour.depthM / 0.3048)).sort((a, b) => a - b), [10, 20, 30]);
  assert.ok(record.lake.outline.length >= 4);
  assert.ok(record.georef.rmsM < 0.01);
  const depths = decodeChartDepths(record.grid);
  const deepest = Math.max(...Array.from(depths).filter((depth) => !Number.isNaN(depth)));
  assert.ok(deepest > 30 * 0.3048 && deepest < 40 * 0.3048, String(deepest));
  assert.equal(report.publishable, true);
  assert.equal(report.coverage, 1);
  assert.equal(report.labelled, 2);
  assert.equal(report.inferred, 1);
});

test("elevation labels become depths below the surface, and personal-use charts are not publishable", () => {
  const chart = vectorChart({ trace: { contourStyles: ["#333333/0.50"], labels: "elevation", surface: 100, interval: 10 }, license: { attestation: "personal-use" } });
  const page = vectorPage();
  page.texts = [{ ...page.texts[0], text: "90" }, { ...page.texts[1], text: "70" }];
  const { record, report } = chartRecord(chart, traceChart(chart, { page }), { fileSha256: "c".repeat(64), tool: "chart-trace@test" });
  assert.equal(record.labels.kind, "elevation");
  assert.deepEqual(record.contours.map((contour) => Math.round(contour.depthM / 0.3048)).sort((a, b) => a - b), [10, 20, 30]);
  assert.equal(report.publishable, false);
});

test("a chart with no levelled contour or no water outline says what to fix", () => {
  const chart = vectorChart();
  const page = vectorPage();
  page.texts = [];
  assert.throws(() => chartRecord(chart, traceChart(chart, { page }), { fileSha256: "d".repeat(64), tool: "t" }), /no contour got a level/);
  const dry = vectorChart({ water: { fillStyles: ["#000000"] } });
  assert.throws(() => chartRecord(dry, traceChart(dry, { page: vectorPage() }), { fileSha256: "d".repeat(64), tool: "t" }), /no water outline/);
});
