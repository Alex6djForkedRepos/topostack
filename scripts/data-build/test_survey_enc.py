"""ENC lake depths: cell priority, drying gate, shoreline samples and gridding."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np
from shapely.geometry import LineString, Point, box

from survey_enc import drying_share, grid_note, lake_grid, lake_points, shoreline

spec = importlib.util.spec_from_file_location('select_enc_lakes', Path(__file__).with_name('select-enc-lakes.py'))
select = importlib.util.module_from_spec(spec)
spec.loader.exec_module(select)

LAKE = box(-81.0, 27.0, -80.99, 27.01)  # about 1 km square in Florida


def cell(name, scale, areas=(), contours=(), soundings=()):
    return {'name': name, 'scale': scale, 'soundingDatum': 12, 'areas': list(areas),
            'contours': list(contours), 'soundings': list(soundings)}


class PointTests(unittest.TestCase):
    def test_detailed_cells_win_and_coarse_cells_fill_the_rest(self):
        west, east = box(-81.0, 27.0, -80.995, 27.01), box(-80.995, 27.0, -80.99, 27.01)
        fine = cell('fine', 12000, areas=[(0, 5, west)], soundings=[(4.0, Point(-80.998, 27.005))])
        coarse = cell('coarse', 180000, areas=[(0, 9, LAKE)], soundings=[
            (9.0, Point(-80.998, 27.004)),   # inside the fine cell's charted area: dropped
            (7.0, Point(-80.992, 27.005)),   # only the coarse cell charts here: kept
        ])
        points = lake_points([coarse, fine], LAKE)
        self.assertEqual(sorted(depth for _, _, depth in points), [4.0, 7.0])
        self.assertTrue(east.contains(Point(points[-1][0], points[-1][1])))

    def test_contours_are_clipped_and_the_shoreline_contour_is_ignored(self):
        line = LineString([(-81.01, 27.005), (-80.98, 27.005)])
        shore = LineString([(-81.0, 27.0), (-80.99, 27.0)])
        points = lake_points([cell('a', 12000, areas=[(0, 5, LAKE)], contours=[(3.0, line), (0.0, shore)])], LAKE)
        self.assertTrue(points)
        self.assertTrue(all(depth == 3.0 and -81.0 <= x <= -80.99 for x, _, depth in points))

    def test_drying_share(self):
        wet = cell('a', 12000, areas=[(0, 2, LAKE), (-1, 0, box(-81.0, 27.0, -80.99, 27.005))])
        self.assertAlmostEqual(drying_share([wet], LAKE), 0.5, places=3)
        self.assertEqual(drying_share([cell('b', 12000)], LAKE), 0.0)
        # Drying areas outside the wet ones still count toward the whole, so the share never exceeds 1.
        mostly_dry = cell('c', 12000, areas=[(0, 2, box(-81.0, 27.0, -80.99, 27.0025)), (-1, 0, box(-81.0, 27.0025, -80.99, 27.01))])
        self.assertAlmostEqual(drying_share([mostly_dry], LAKE), 0.75, places=3)

    def test_shoreline_samples_every_ring_at_zero(self):
        ring = box(0, 0, 1000, 1000).difference(box(400, 400, 600, 600))
        samples = shoreline(ring, spacing=100)
        self.assertTrue(all(depth == 0 for _, _, depth in samples))
        self.assertGreaterEqual(len(samples), 40 + 8)
        self.assertTrue(any(400 <= x <= 600 and 400 <= y <= 600 for x, y, _ in samples))


class GridTests(unittest.TestCase):
    def test_a_charted_bowl_is_gridded_inside_the_outline(self):
        soundings = [(8.0, Point(-80.995, 27.005)), (5.0, Point(-80.997, 27.005)), (5.0, Point(-80.993, 27.005))]
        (values, transform, crs, samples), reason = lake_grid([cell('a', 12000, areas=[(0, 9, LAKE)], soundings=soundings)], LAKE)
        self.assertIsNone(reason)
        self.assertEqual(samples, 3)
        self.assertEqual(crs, 'EPSG:32617')
        self.assertAlmostEqual(float(np.nanmax(values)), 8.0, delta=0.5)
        self.assertGreaterEqual(float(np.nanmin(values)), 0.0)

    def test_a_mostly_drying_lake_is_refused(self):
        grid, reason = lake_grid([cell('a', 12000, areas=[(-1, 0, LAKE), (0, 1, box(-81.0, 27.0, -80.999, 27.001))],
                                       soundings=[(0.5, Point(-80.9995, 27.0005))])], LAKE)
        self.assertIsNone(grid)
        self.assertIn('drying', reason)

    def test_a_lake_without_contours_or_soundings_is_refused(self):
        grid, reason = lake_grid([cell('a', 180000, areas=[(0, 5.4, LAKE)])], LAKE)
        self.assertIsNone(grid)
        self.assertEqual(reason, 'No charted contours or soundings inside the lake')


class SelectionTests(unittest.TestCase):
    def test_fixed_pool_datums_are_recognized(self):
        mead = 'SOUNDING DATUM Soundings refer to a normal lake level elevation which is 353.5 meters / 1160 feet above Mean Sea Level.'
        self.assertTrue(select.FIXED_POOL.search(mead))
        for note in ('CAUTION - LOW WATER DATUM Due to periodic high water conditions in the Great Lakes, some features charted as visible at Low Water Datum may be submerged.',
                     'SOUNDING DATUM Soundings and clearances of bridges and overhead cables are referred to the Columbia River Datum (Mean Lower Low Water During Lowest River Stages).'):
            self.assertIsNone(select.FIXED_POOL.search(note))

    def test_datasets(self):
        self.assertEqual(select.assign_dataset('NY', False), 'noaa-enc-new-york-vermont-v1')
        self.assertEqual(select.assign_dataset('NY', True), 'noaa-enc-atlantic-coast-v1')
        self.assertEqual(select.assign_dataset('VT', False), 'noaa-enc-new-york-vermont-v1')
        self.assertEqual(select.assign_dataset('MI', False), 'noaa-enc-great-lakes-basin-v1')
        self.assertEqual(select.assign_dataset('LA', True), 'noaa-enc-gulf-coast-v1')
        self.assertEqual(select.assign_dataset('CA', False), 'noaa-enc-california-v1')
        self.assertEqual(select.assign_dataset('OR', False), 'noaa-enc-columbia-river-v1')
        self.assertIsNone(select.assign_dataset('NV', False))

    def test_notes_name_the_datum(self):
        self.assertIn('Normal Pool Level', grid_note({'datumNotes': ['CAUTION - LOW WATER DATUM ... visible at Normal Pool Level may be submerged']}))
        self.assertIn('Low Water Datum', grid_note({'datumNotes': ['CAUTION - LOW WATER DATUM ... visible at Low Water Datum may be submerged']}))
        self.assertIn('MLLW', grid_note({'datumNotes': []}))


if __name__ == '__main__':
    unittest.main()
