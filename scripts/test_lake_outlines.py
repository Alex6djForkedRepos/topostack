"""Checks the island treatment used when publishing provider masks."""
import importlib
import unittest
from shapely.geometry import box

outlines = importlib.import_module('build-lake-outlines')


class WaterMasks(unittest.TestCase):
    def test_separate_island_records_become_holes(self):
        water = outlines.clean_water([box(0, 0, 10, 10)], [box(2, 2, 4, 4)])
        self.assertTrue(water.is_valid)
        self.assertEqual(water.area, 96)
        self.assertEqual(len(water.interiors), 1)

    def test_overlapping_water_records_do_not_fill_existing_islands(self):
        water = box(0, 0, 10, 10).difference(box(2, 2, 4, 4))
        merged = outlines.clean_water([water, water])
        self.assertEqual(merged.area, 96)
        self.assertEqual(len(merged.interiors), 1)


if __name__ == '__main__':
    unittest.main()
