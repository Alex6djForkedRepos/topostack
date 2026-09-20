"""Independent geometric and acquisition failure checks for regional surveys."""
import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
from shapely.geometry import Polygon, box
from survey_regions import contour_grid, spatial_contours

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).with_name('snapshot-survey-service.py'))
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class RegionalSurveyTests(unittest.TestCase):
    def test_plane_depth_and_island_mask(self):
        # A surveyed plane D=x/10 is analytically known, independently of triangulation.
        points = [(0, 0, 0), (100, 0, 10), (100, 100, 10), (0, 100, 0)]
        water = Polygon([(0, 0), (100, 0), (100, 100), (0, 100)],
                        holes=[[(40, 40), (60, 40), (60, 60), (40, 60)]])
        values, _ = contour_grid(points, water, 10)
        self.assertTrue(np.isnan(values[4:6, 4:6]).all())
        np.testing.assert_allclose(values[0], np.arange(0.5, 10, 1))

    def test_no_extrapolation_past_survey_hull(self):
        points = [(20, 20, 2), (80, 20, 8), (20, 80, 2)]
        values, _ = contour_grid(points, box(0, 0, 100, 100), 10)
        self.assertTrue(np.isnan(values[0]).all())
        self.assertTrue(np.isnan(values[:, -1]).all())
        self.assertAlmostEqual(float(values[7, 2]), 2.5)

    def test_conflicting_samples_do_not_depend_on_input_order(self):
        points = [(0, 0, 0), (100, 0, 10), (100, 100, 10), (0, 100, 0), (50, 50, 1), (50, 50, 90)]
        a, _ = contour_grid(points, box(0, 0, 100, 100), 10)
        b, _ = contour_grid(points[::-1], box(0, 0, 100, 100), 10)
        np.testing.assert_allclose(a, b)
        self.assertLess(float(np.nanmax(a)), 10)

    def test_invalid_and_degenerate_surveys_fail(self):
        for points in [[(0, 0, 1), (1, 1, 2), (2, 2, 3)],
                       [(0, 0, -1), (100, 0, 5), (0, 100, 10)],
                       [(0, 0, 0), (100, 0, 0), (0, 100, 0)]]:
            with self.assertRaises(ValueError):
                contour_grid(points, box(0, 0, 100, 100), 10)

    def test_real_ontario_negative_depths_and_changed_input_cache(self):
        import fiona
        fixture = Path(__file__).parent.parent / 'test/fixtures/ontario-depth-lines.geojson'
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root / 'contours.geojson.gz'
            with gzip.open(source, 'wb') as stream:
                stream.write(fixture.read_bytes())
            indexed = spatial_contours(source, root, 'EPSG:3161', 'DEPTH', depth_scale=-1)
            with fiona.open(indexed) as lines:
                depths = sorted(f['properties']['depth'] for f in lines)
            np.testing.assert_allclose(depths, [18.3, 21.3], atol=0.00001)
            changed = json.loads(fixture.read_text())
            changed['features'][0]['properties']['DEPTH'] = -19
            with gzip.open(source, 'wt') as stream:
                json.dump(changed, stream)
            # A dataset refresh is a separate build process. GDAL caches gzip
            # seek offsets within a process, so exercise that real lifecycle.
            import subprocess
            import sys
            refreshed = Path(subprocess.check_output([
                sys.executable, '-c',
                "from pathlib import Path; import sys; from survey_regions import spatial_contours; "
                "print(spatial_contours(Path(sys.argv[1]), Path(sys.argv[2]), 'EPSG:3161', 'DEPTH', depth_scale=-1))",
                str(source), str(root),
            ], cwd=Path(__file__).parent, text=True).strip())
            self.assertNotEqual(indexed, refreshed)
            with fiona.open(refreshed) as lines:
                self.assertIn(19, [f['properties']['depth'] for f in lines])

    def test_parallel_tile_merge_matches_serial_priority_exactly(self):
        from importlib import import_module
        from rasterio.transform import from_bounds
        builder = import_module('build-survey-bathymetry')
        source = {'id': 'fixture-v1', 'name': 'Fixture', 'url': 'https://example.test',
                  'license': 'Test', 'bounds': [-2, -2, 2, 2], 'maxZoom': 2,
                  'encoding': 'depth-terrarium-v1'}
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            a = np.full((8, 8), 10, dtype=np.float32)
            a[4:] = np.nan
            b = np.full((8, 8), 20, dtype=np.float32)
            paths = [builder.write_grid(root / f'{i}.tif', values,
                     from_bounds(-200000, -200000, 200000, 200000, 8, 8), 'EPSG:3857')
                     for i, values in enumerate([a, b])]
            serial = builder.TileWriter(root / 'serial.pmtiles', source)
            combined = builder.TileWriter(root / 'combined.pmtiles', source)
            try:
                for i, path in enumerate(paths):
                    serial.add(path, str(i))
                    worker = builder.TileWriter(root / f'worker-{i}.pmtiles', source)
                    worker.add(path, str(i))
                    worker.db.close()
                    combined.merge_tiles(worker.database, worker.grids[0])
                query = 'SELECT * FROM tiles ORDER BY zoom_level,tile_column,tile_row'
                expected = serial.db.execute(query).fetchall()
                self.assertTrue(expected)
                self.assertEqual(combined.db.execute(query).fetchall(), expected)
                self.assertEqual(combined.grids, serial.grids)
            finally:
                serial.db.close()
                combined.db.close()

    def test_snapshot_splits_truncated_responses_and_checks_all_ids(self):
        def request(url, params):
            if not url.endswith('/query'):
                return {'name': 'Fixture'}
            if params.get('returnIdsOnly'):
                return {'objectIdFieldName': 'OBJECTID', 'objectIds': [3, 1, 2]}
            ids = [int(i) for i in params['objectIds'].split(',')]
            return {'type': 'FeatureCollection', 'exceededTransferLimit': len(ids) > 1,
                    'features': [{'type': 'Feature', 'id': ids[0], 'properties': {'OBJECTID': ids[0]}, 'geometry': None}]}
        with tempfile.TemporaryDirectory() as folder, patch.object(snapshot, 'request', side_effect=request):
            output = Path(folder) / 'survey.geojson.gz'
            snapshot.snapshot('https://example.test/MapServer/1', output)
            with gzip.open(output) as stream:
                features = json.load(stream)['features']
            self.assertEqual([f['id'] for f in features], [1, 2, 3])

    def test_missing_single_feature_never_publishes_snapshot(self):
        def request(url, params):
            if not url.endswith('/query'):
                return {}
            if params.get('returnIdsOnly'):
                return {'objectIdFieldName': 'OBJECTID', 'objectIds': [1]}
            return {'type': 'FeatureCollection', 'features': []}
        with tempfile.TemporaryDirectory() as folder, patch.object(snapshot, 'request', side_effect=request):
            output = Path(folder) / 'survey.geojson.gz'
            with self.assertRaises(ValueError):
                snapshot.snapshot('https://example.test/MapServer/1', output)
            self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
