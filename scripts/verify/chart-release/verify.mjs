// Run from repository root. No survey points are used to build this fixture.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { buildChartFromImage } from '../../../apps/generator/src/lib/domain/chart-build.ts';
import { reviewGeometryIssues, reviewAlignment } from '../../../apps/generator/src/lib/domain/chart-review.ts';
const source = JSON.parse(await readFile('scripts/verify/chart-release/king-city-reviewed.json'));
const lake = JSON.parse(await readFile('scripts/verify/chart-accuracy/fixtures/king-city-lake.json'));
const request = {
  image: { width: source.imageSize[0], height: source.imageSize[1], data: new Uint8ClampedArray() },
  lake, review: source.review, units: source.units, labels: 'elevation', surface: source.surface,
  interval: source.interval, resolutionM: source.resolutionM, title: 'USGS King City South reviewed source trial',
  attestation: 'public-domain', fileSha256: source.pdfSha256, tool: 'reviewed-source-regression', id: 'king-city-reviewed-release',
};
assert.deepEqual(reviewGeometryIssues(source.review, request), []);
const alignment = reviewAlignment(source.review, lake.outline);
const result = buildChartFromImage(request);
assert.equal(result.report.inferred, 0);
assert.deepEqual(result.record.contours.map(c => c.depthM).sort((a,b) => a-b), [.152,.762,1.372,1.981,2.591,3.2,3.81,4.42]);
assert.equal(result.record.review, undefined, 'Layer review has not happened yet');
const broken = structuredClone(request);
broken.review.contours.find(c => !c.excluded && c.id !== broken.review.shorelineId).confirmed = false;
assert.throws(() => buildChartFromImage(broken), /Confirm/);
await mkdir('.topostack/chart-release', { recursive: true });
await writeFile('.topostack/chart-release/king-reviewed-record.json', JSON.stringify(result));
console.log(JSON.stringify({ contours: result.record.contours.length, alignmentIou: alignment.iou, report: result.report }, null, 2));
