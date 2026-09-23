"""Published depth chart records to survey grids. See docs/depth-chart-tracing.md.

`trace-depth-charts.mjs` writes one UserChartBathymetryV1 record per curated
chart into scripts/data/depth-charts/, but only for charts whose licence allows
publishing. This turns those records into the grids the survey archive writer
expects, so community charts reach the studio through the same path as a
government survey.

The record's own grid is used as it stands. The record states how it was made
(contours, interval, method, tool version), so regridding here would risk two
interpolators disagreeing about the same chart; a reviewer who wants a different
grid re-runs the tracer and commits the new record.
"""
import base64
import json
from pathlib import Path

import numpy as np
from rasterio.transform import from_bounds

RECORDS = Path(__file__).parent.parent / 'data/depth-charts'
DATASET = 'community-charts-v1'
# The archive's own catalog entry. It is deliberately NOT in
# scripts/data/lake-bathymetry.json yet: that file is live for every visitor, and
# a source there whose archive is not in R2 makes the studio report missing depth
# data. Registering it is the provisioning step in docs/depth-chart-tracing.md,
# which copies this entry across after the archive is uploaded. `bounds` must
# cover every published record; widening it is how a chart in a new place is
# admitted.
SOURCE = {
    'id': DATASET,
    'name': 'Published depth charts',
    'url': 'https://github.com/Echo-Foxtrot-Works/topostack/tree/main/scripts/data/depth-charts',
    'license': ("Traced by TopoStack from published depth charts whose licence allows redistribution. "
                "Each chart's publisher, source and licence are in the archive receipt and in its record."),
    'bounds': [-94.09, 39.9, -94.05, 39.95],
    'encoding': 'depth-terrarium-v1',
    'maxZoom': 14,
}
# Mirrors CHART_ATTESTATIONS/isPublishableChart in @topostack/data-contracts.
PUBLISHABLE = ('own-work', 'public-domain', 'open-license')
NO_DEPTH = 0xFFFF


def decode_depths(grid):
    """Base64 little-endian uint16 decimetres to metres, with 0xffff as no data."""
    raw = base64.b64decode(grid['depthsDm'], validate=True)
    if len(raw) != grid['width'] * grid['height'] * 2:
        raise ValueError('Chart grid length does not match its width and height')
    codes = np.frombuffer(raw, dtype='<u2').reshape(grid['height'], grid['width'])
    return np.where(codes == NO_DEPTH, np.nan, codes / 10).astype(np.float32)


def read_records(directory=RECORDS):
    """Every published record, by id. A record that may not be published is a
    mistake in the directory, not something to skip quietly."""
    records = []
    for path in sorted(Path(directory).glob('*.json')):
        record = json.loads(path.read_text())
        attestation = record.get('license', {}).get('attestation')
        if attestation not in PUBLISHABLE:
            raise ValueError(f"{path.name}: licence attestation '{attestation}' may not be published")
        records.append(record)
    return records


def charts(source, cache, writer, write_grid, records=None):
    """Grid every published record into the archive; returns the writer's source pins."""
    records = read_records() if records is None else records
    if not records:
        raise ValueError('No published depth chart records; run scripts/data-build/trace-depth-charts.mjs')
    west, south, east, north = source['bounds']
    pins = []
    for record in records:
        grid, bounds = record['grid'], record['grid']['bounds']
        if bounds['west'] < west or bounds['east'] > east or bounds['south'] < south or bounds['north'] > north:
            raise ValueError(f"{record['id']} lies outside {source['id']} bounds; widen SOURCE['bounds'] in chart_records.py")
        prepared = cache / 'charts' / f"{record['id']}.tif"
        transform = from_bounds(bounds['west'], bounds['south'], bounds['east'], bounds['north'], grid['width'], grid['height'])
        write_grid(prepared, decode_depths(grid), transform, 'EPSG:4326')
        writer.add(prepared, record['id'])
        provenance = record['provenance']
        # The contract makes the lake's name optional, but the lake directory
        # lists published charts by it, so a nameless one is stopped here with
        # a reason rather than a KeyError. A maker's own chart has no source URL.
        if not record['lake'].get('name'):
            raise ValueError(f"{record['id']} has no lake name; name the lake in the record before publishing it")
        pins.append({
            'id': record['id'],
            'dataset': source['id'],
            'lake': record['lake']['name'],
            'region': record['lake'].get('region'),
            'title': provenance['title'],
            'publisher': provenance.get('publisher'),
            'url': provenance.get('sourceUrl'),
            'sha256': provenance['fileSha256'],
            'tool': provenance['tool'],
            'license': record['license']['attestation'],
        })
        print(f"Depth chart: {record['id']} ({grid['width']}x{grid['height']})", flush=True)
    return pins
