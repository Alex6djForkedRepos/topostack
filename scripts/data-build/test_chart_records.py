"""Independent checks that published depth chart records become survey grids."""
import base64
import json
from pathlib import Path
import tempfile
import unittest

import numpy as np
import rasterio

from chart_records import SOURCE as CHART_SOURCE, charts, decode_depths, read_records

CATALOG = json.loads((Path(__file__).parent.parent / 'data/lake-bathymetry.json').read_text())['sources']


def grid(depths_dm, width, height, bounds):
    """A record grid from decimetre codes, as encodeChartDepths writes them."""
    codes = np.asarray(depths_dm, dtype='<u2').reshape(height, width)
    return {'width': width, 'height': height, 'bounds': bounds, 'method': 'harmonic',
            'depthsDm': base64.b64encode(codes.tobytes()).decode()}


def record(id='synthetic-chart', bounds=None, attestation='public-domain'):
    bounds = bounds or {'west': -94.08, 'south': 39.91, 'east': -94.06, 'north': 39.93}
    return {'id': id, 'lake': {'name': 'Synthetic Lake'},
            'grid': grid([0, 15, 0xFFFF, 250], 2, 2, bounds),
            'provenance': {'title': 'Synthetic chart', 'publisher': 'Nobody', 'sourceUrl': 'https://example.org/chart.pdf',
                           'fileSha256': 'a' * 64, 'tool': 'chart-trace@test'},
            'license': {'attestation': attestation}}


class FakeWriter:
    def __init__(self):
        self.added = []

    def add(self, path, name):
        self.added.append((path, name))

    def finish(self, pins):
        self.pins = pins


class ChartRecordTests(unittest.TestCase):
    def test_decimetre_codes_become_metres_with_a_gap(self):
        values = decode_depths(grid([0, 15, 0xFFFF, 1500 * 10], 2, 2, {}))
        np.testing.assert_allclose(values[0], [0, 1.5])
        self.assertTrue(np.isnan(values[1, 0]))
        self.assertEqual(values[1, 1], 1500)
        self.assertEqual(values.dtype, np.float32)
        with self.assertRaises(ValueError):
            decode_depths(grid([0, 1], 1, 2, {}) | {'width': 3})

    def test_records_grid_north_up_in_lon_lat_and_pin_their_source(self):
        from tile_writer import write_grid
        with tempfile.TemporaryDirectory() as directory:
            writer = FakeWriter()
            pins = charts(CHART_SOURCE, Path(directory), writer, write_grid, [record()])
            self.assertEqual([name for _, name in writer.added], ['synthetic-chart'])
            self.assertEqual(pins[0]['url'], 'https://example.org/chart.pdf')
            self.assertEqual(pins[0]['sha256'], 'a' * 64)
            self.assertEqual(pins[0]['license'], 'public-domain')
            with rasterio.open(writer.added[0][0]) as src:
                self.assertEqual(src.crs.to_epsg(), 4326)
                # Row 0 is the north edge, as the contract stores the grid.
                self.assertEqual(src.bounds.top, 39.93)
                values = src.read(1)
                np.testing.assert_allclose(values[0], [0, 1.5])
                self.assertTrue(np.isnan(values[1, 0]))

    def test_optional_record_fields_are_optional(self):
        from tile_writer import write_grid
        own = record(attestation='own-work')
        del own['provenance']['sourceUrl']
        del own['provenance']['publisher']
        with tempfile.TemporaryDirectory() as directory:
            pins = charts(CHART_SOURCE, Path(directory), FakeWriter(), write_grid, [own])
        self.assertIsNone(pins[0]['url'])
        self.assertIsNone(pins[0]['publisher'])
        nameless = record()
        del nameless['lake']['name']
        with tempfile.TemporaryDirectory() as directory, self.assertRaisesRegex(ValueError, 'no lake name'):
            charts(CHART_SOURCE, Path(directory), FakeWriter(), write_grid, [nameless])

    def test_a_chart_outside_the_source_bounds_names_the_file_to_widen(self):
        from tile_writer import write_grid
        with tempfile.TemporaryDirectory() as directory:
            far = record(bounds={'west': -80, 'south': 44, 'east': -79.9, 'north': 44.1})
            with self.assertRaisesRegex(ValueError, 'chart_records.py'):
                charts(CHART_SOURCE, Path(directory), FakeWriter(), write_grid, [far])
            with self.assertRaisesRegex(ValueError, 'trace-depth-charts'):
                charts(CHART_SOURCE, Path(directory), FakeWriter(), write_grid, [])

    def test_a_record_that_may_not_be_published_stops_the_build(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'personal.json').write_text(json.dumps(record(attestation='personal-use')))
            with self.assertRaisesRegex(ValueError, 'may not be published'):
                read_records(directory)

    def test_the_source_matches_the_catalog_once_it_is_registered(self):
        registered = next((source for source in CATALOG if source['id'] == CHART_SOURCE['id']), None)
        if registered is not None:
            self.assertEqual(registered, CHART_SOURCE, 'the catalog entry and chart_records.SOURCE have drifted apart')

    def test_the_committed_records_are_publishable_and_inside_the_source_bounds(self):
        records = read_records()
        self.assertTrue(records, 'expected at least one published depth chart record')
        west, south, east, north = CHART_SOURCE['bounds']
        for item in records:
            bounds = item['grid']['bounds']
            self.assertGreaterEqual(bounds['west'], west, item['id'])
            self.assertLessEqual(bounds['east'], east, item['id'])
            self.assertGreaterEqual(bounds['south'], south, item['id'])
            self.assertLessEqual(bounds['north'], north, item['id'])


if __name__ == '__main__':
    unittest.main()
