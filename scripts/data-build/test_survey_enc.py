"""ENC lake depths: cell priority, drying gate, shoreline samples and gridding."""
import unittest

import numpy as np
from shapely.geometry import LineString, Point, box

from survey_enc import drying_share, lake_grid, lake_points, shoreline

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


if __name__ == '__main__':
    unittest.main()
