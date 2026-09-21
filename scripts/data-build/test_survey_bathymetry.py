"""Independent numerical checks for lake survey normalization and archive safety."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile
import numpy as np

spec = importlib.util.spec_from_file_location('surveys', Path(__file__).with_name('build-survey-bathymetry.py'))
surveys = importlib.util.module_from_spec(spec)
spec.loader.exec_module(surveys)

class SurveyTests(unittest.TestCase):
    def test_survey_elevation_reference_and_feet(self):
        np.testing.assert_allclose(surveys.depth_from_elevation(np.array([1882.6,1289.1]),1882.6),[0,593.5],atol=0.0001)
        np.testing.assert_allclose(surveys.depth_from_elevation(np.array([6390,6290]),6390,0.3048),[0,30.48],atol=0.0001)
        self.assertTrue(np.isnan(surveys.depth_from_elevation(np.array([6400,np.nan]),6390)).all())

    def test_numeric_png_encoding_and_nodata(self):
        values=np.array([[0,593.5,np.nan,-1,1600]],dtype=np.float32)
        pixels=surveys.encode(values)
        decoded=pixels[...,0].astype(float)*256+pixels[...,1]+pixels[...,2]/256-32768
        np.testing.assert_allclose(decoded[0,:2],values[0,:2])
        np.testing.assert_array_equal(pixels[0,:,3],[255,255,0,0,0])
        elevated=surveys.encode(np.array([[-200,1757.125,9001]],dtype=np.float32),elevation=True)
        np.testing.assert_array_equal(elevated[0,:,3],[255,255,0])

    def test_e00_grid_rows_restart_on_new_lines(self):
        # Seven-wide rows occupy two five-value lines; DDS-55 pads the second line
        # with filler instead of ending it early. Both layouts must keep columns aligned.
        grid=np.arange(21,dtype=np.float32).reshape(3,7)*10+1800
        cell=lambda v:f'{v:14.7E}'
        padded=[''.join(cell(v) for v in (*row,-3.402823e38,1888,-3.402823e38))
                for row in grid]
        padded=[line for row in padded for line in (row[:70],row[70:])]
        short=[line for row in grid for line in (''.join(cell(v) for v in row[:5]),''.join(cell(v) for v in row[5:]))]
        for lines in (padded,short):
            np.testing.assert_array_equal(surveys.read_e00_rows(iter(lines+['EOG']),7,3),grid)
        with self.assertRaises(ValueError):surveys.read_e00_rows(iter(padded[:-1]+['EOG']),7,3)
        nodata=surveys.read_e00_rows(iter([cell(-3.402823e38)*2]),2,1)
        self.assertTrue(np.isnan(nodata).all())

    def test_zip_extraction_rejects_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);archive=root/'input.zip'
            with zipfile.ZipFile(archive,'w') as z:z.writestr('../escape','bad')
            with self.assertRaises(ValueError):surveys.unzip(archive,root/'out')
            self.assertFalse((root/'escape').exists())

    def test_finnish_contour_depth_accepts_strings_and_numbers(self):
        self.assertEqual(surveys.finnish_contour_depth({'Syvyyskayr':'2,5'}),2.5)
        self.assertEqual(surveys.finnish_contour_depth({'Syvyyskayr':' 10 '}),10)
        self.assertEqual(surveys.finnish_contour_depth({'Syvyyskayr':3}),3)
        self.assertEqual(surveys.finnish_contour_depth({'Syvyyskayr':1.25}),1.25)
        for properties in ({},{'Syvyyskayr':None},{'Syvyyskayr':''},{'Syvyyskayr':'n/a'},{'Syvyyskayr':'nan'},None):
            self.assertIsNone(surveys.finnish_contour_depth(properties))

    def test_depth_parse_ratio_fails_only_above_threshold(self):
        features=[{'Syvyyskayr':'1,5'},{'Syvyyskayr':2},{'Other':'3'},{'Syvyyskayr':'bad'},{'Other':None}]
        depths=[surveys.finnish_contour_depth(f) for f in features]
        skipped=sum(d is None for d in depths)
        with self.assertRaises(ValueError):surveys.check_depth_parse_ratio(skipped,len(depths),'Finland')
        surveys.check_depth_parse_ratio(skipped,len(depths)+1,'Finland')
        surveys.check_depth_parse_ratio(0,0,'Finland')

if __name__=='__main__':unittest.main()
