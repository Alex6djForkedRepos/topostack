"""Checks the island treatment used when publishing provider masks."""
import importlib
import json
from pathlib import Path
import tempfile
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


def feature(source, key, x):
    return {'type': 'Feature', 'bbox': [x, 0, x + 0.5, 0.5], 'properties': {'sourceId': source, 'surveyId': key, 'name': key},
            'geometry': {'type': 'Polygon', 'coordinates': [[[x, 0], [x + 0.5, 0], [x + 0.5, 0.5], [x, 0]]]}}


class ShardPublishing(unittest.TestCase):
    def test_replaces_index_and_prunes_only_stale_shards(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            first = outlines.publish_shards(output, {'a:1': feature('a', '1', 0), 'a:2': feature('a', '2', 5)})
            self.assertEqual(len(first), 2)
            (output / 'README.txt').write_text('keep')
            (output / 'notes.json').write_text('{}')
            second = outlines.publish_shards(output, {'a:1': feature('a', '1', 0)})
            index = json.loads((output / 'index.json').read_text())
            self.assertEqual(index['shards'], second)
            self.assertEqual(second[0]['file'], first[0]['file'])
            names = sorted(path.name for path in output.iterdir())
            self.assertEqual(names, sorted(['README.txt', 'index.json', 'notes.json', second[0]['file']]))
            for shard in second:
                self.assertEqual(json.loads((output / shard['file']).read_text())['features'][0]['properties']['surveyId'], '1')

    def test_failed_index_write_keeps_previous_index_and_shards(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            first = outlines.publish_shards(output, {'a:1': feature('a', '1', 0)})
            before = (output / 'index.json').read_text()
            original = outlines.write_atomic
            def fail_index(target, payload):
                if target.name == 'index.json':
                    raise OSError('disk full')
                return original(target, payload)
            outlines.write_atomic = fail_index
            try:
                with self.assertRaises(OSError):
                    outlines.publish_shards(output, {'b:1': feature('b', '1', 9)})
            finally:
                outlines.write_atomic = original
            self.assertEqual((output / 'index.json').read_text(), before)
            self.assertTrue((output / first[0]['file']).exists())
            self.assertFalse(any(path.name.endswith('.part') for path in output.iterdir()))


if __name__ == '__main__':
    unittest.main()
