"""NBS inventory: attribute-table parsing, cell classification and lake matching."""
from pathlib import Path
import tempfile
import unittest

import fiona
import numpy as np
from shapely.geometry import box, mapping

from nbs_inventory import (classify_cells, footprint, lake_record, match_lakes, parse_rat,
                           read_scheme, source_kind, summarize_rat)

FIELDS = ['value', 'count', 'data_assessment', 'source_survey_id', 'source_institution',
          'survey_date_start', 'survey_date_end', 'license_name']


def rat_xml(rows):
    """A GDAL .aux.xml in the shape NBS publishes, with fields out of positional order."""
    defs = ''.join(f'<FieldDefn index="{i}"><Name>{name}</Name></FieldDefn>' for i, name in enumerate(FIELDS))
    body = ''.join('<Row index="%d">%s</Row>' % (i, ''.join(f'<F>{cell}</F>' for cell in row)) for i, row in enumerate(rows))
    return f'<PAMDataset><PAMRasterBand band="1"><GDALRasterAttributeTable>{defs}{body}</GDALRasterAttributeTable></PAMRasterBand></PAMDataset>'


ROWS = [
    ['0', '300', '3', 'NBS Generalization', 'DOC/NOAA/NOS/OCS -- Office of Coast Survey', '1807-02-10', '1807-02-10', 'cc0-1.0'],
    ['7', '2000', '1', 'L02188.interpolated', 'DOD/USACE -- United States Lake Survey', '1948-01-01', '1948-01-01', 'cc0-1.0'],
    ['9', '50', '1', 'H11810_MB_1m_LLL_2of4', 'DOC/NOAA/NOS/OCS -- Office of Coast Survey', '2008-06-01', '2008-07-01', 'cc0-1.0'],
    ['12', '400', '2', 'US,US,graph,Chart 14916_20160301_US5WI2UL_20241016', '', '', '', 'cc0-1.0'],
    ['14', '80', '1', 'W00455', 'University survey', '2019-05-01', '2019-05-02', 'CC BY-NC 4.0'],
    ['15', '20', '1', 'H13001', 'DOC/NOAA/NOS/OCS -- Office of Coast Survey', '2021-01-01', '2021-01-02', 'CC-BY-4.0'],
    ['16', '5', '1', 'gsb_f_2m_MLLW', '', '2012-01-01', '2012-01-02', ''],
]


class RatTests(unittest.TestCase):
    def test_rows_are_read_by_field_name(self):
        rows = parse_rat(rat_xml(ROWS))
        self.assertEqual([row['value'] for row in rows], [0, 7, 9, 12, 14, 15, 16])
        self.assertEqual(rows[1]['source'], 'L02188.interpolated')
        self.assertEqual([row['kind'] for row in rows],
                         ['generalization', 'survey', 'survey', 'chart', 'restricted', 'survey', 'restricted'])

    def test_missing_fields_are_rejected(self):
        with self.assertRaisesRegex(ValueError, 'lacks'):
            parse_rat('<PAMDataset><GDALRasterAttributeTable><FieldDefn><Name>value</Name></FieldDefn></GDALRasterAttributeTable></PAMDataset>')
        with self.assertRaisesRegex(ValueError, 'No raster attribute table'):
            parse_rat('<PAMDataset/>')

    def test_source_kinds(self):
        self.assertEqual(source_kind('NBS Generalization', 'cc0-1.0'), 'generalization')
        self.assertEqual(source_kind('US,US,graph,Chart 11369_20120601', 'cc0-1.0'), 'chart')
        self.assertEqual(source_kind('H02609.interpolated', 'CC0-1.0'), 'survey')

    def test_sources_without_an_open_licence_are_restricted(self):
        for name in ('CC BY-NC 4.0', 'cc-by-nc-4.0', 'IUO-rel-HSD', 'Pending', ''):
            self.assertEqual(source_kind('H12345', name), 'restricted', name)
        self.assertEqual(source_kind('US,US,graph,Chart 14916', 'Pending'), 'restricted')

    def test_summary_separates_measurements_from_fill(self):
        summary = summarize_rat(parse_rat(rat_xml(ROWS)))
        self.assertEqual(summary['cells'], {'survey': 2070, 'chart': 400, 'restricted': 85, 'generalization': 300})
        # The generalization's placeholder 1807 date is not a survey year, and restricted surveys do not count.
        self.assertEqual(summary['surveyYears'], [1948, 2021])
        # A blank licence is reported, so restricted cells always have a licence to explain them.
        self.assertEqual(summary['licenses'], ['cc-by-4.0', 'cc-by-nc-4.0', 'cc0-1.0', 'unspecified'])
        self.assertNotIn('', summary['institutions'])


class CellTests(unittest.TestCase):
    def test_cells_are_counted_inside_the_lake_only(self):
        inside = np.array([[1, 1, 1, 0]], dtype=bool)
        elevation = np.ma.masked_array([[-5.0, -3.0, -1.0, -9.0]], mask=[[False, False, True, False]])
        contributor = np.array([[7, 12, 7, 7]])
        counts = classify_cells(inside, elevation, contributor, {0: 'generalization', 7: 'survey', 12: 'chart'})
        self.assertEqual(counts, {'survey': 1, 'chart': 1, 'restricted': 0, 'generalization': 0, 'empty': 1})

    def test_unknown_contributors_count_as_fill(self):
        inside = np.ones((1, 2), dtype=bool)
        elevation = np.ma.masked_array([[-2.0, -2.0]])
        counts = classify_cells(inside, elevation, np.array([[99, 7]]), {7: 'survey'})
        self.assertEqual(counts['generalization'], 1)
        self.assertEqual(counts['survey'], 1)


class SchemeAndLakeTests(unittest.TestCase):
    def test_scheme_keeps_only_delivered_tiles(self):
        schema = {'geometry': 'Polygon', 'properties': {
            'tile': 'str', 'GeoTIFF_Link': 'str', 'RAT_Link': 'str', 'Delivered_Date': 'str',
            'Resolution': 'str', 'UTM': 'str', 'GeoTIFF_SHA256_Checksum': 'str', 'RAT_SHA256_Checksum': 'str'}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'scheme.gpkg'
            with fiona.open(path, 'w', driver='GPKG', crs='EPSG:4326', schema=schema) as out:
                for name, link in (('A', 'https://example.test/A.tiff'), ('B', None)):
                    out.write({'geometry': mapping(box(-90.2, 30.1, -90.1, 30.2)), 'properties': {
                        'tile': name, 'GeoTIFF_Link': link, 'RAT_Link': link and link + '.aux.xml',
                        'Delivered_Date': '2026-09-05', 'Resolution': '4m', 'UTM': '15',
                        'GeoTIFF_SHA256_Checksum': 'ab', 'RAT_SHA256_Checksum': 'cd'}})
            tiles = read_scheme(path)
        self.assertEqual([tile['tile'] for tile in tiles], ['A'])
        self.assertEqual(tiles[0]['bounds'], [-90.2, 30.1, -90.1, 30.2])

    def test_lakes_match_meeting_tiles_and_skip_failed_scans(self):
        tiles = [
            {'tile': 'A', 'bounds': [0, 0, 1, 1]},
            {'tile': 'B', 'bounds': [1, 0, 2, 1]},
            {'tile': 'C', 'bounds': [0.2, 0.2, 0.4, 0.4], 'error': 'timeout'},
        ]
        lakes = [{'id': 1, 'name': 'Split', 'geometry': box(0.5, 0.2, 1.5, 0.8)},
                 {'id': 2, 'name': 'Elsewhere', 'geometry': box(5, 5, 6, 6)}]
        matched = match_lakes(tiles, lakes)
        self.assertEqual([lake['id'] for lake in matched], [1])
        self.assertEqual(sorted(tile['tile'] for tile in matched[0]['tiles']), ['A', 'B'])

    def test_footprint_and_record(self):
        tile = {'tile': 'A', 'bounds': [0, 0, 1, 1], 'url': 'u', 'sha256': 's', 'resolution': '4m',
                'delivered': 'd', 'surveyYears': [1948, 1949], 'institutions': ['X']}
        lake = {'id': 3, 'name': 'Half', 'geometry': box(0.5, 0, 1.5, 1), 'tiles': [tile]}
        self.assertEqual(footprint(lake), 0.5)
        record = lake_record(lake, {'survey': 1.0})
        self.assertEqual(record['surveyYears'], [1948, 1949])
        self.assertEqual(record['tiles'], [{'tile': 'A', 'url': 'u', 'sha256': 's', 'resolution': '4m', 'delivered': 'd'}])


if __name__ == '__main__':
    unittest.main()
