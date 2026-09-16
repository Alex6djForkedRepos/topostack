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

    def test_zip_extraction_rejects_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);archive=root/'input.zip'
            with zipfile.ZipFile(archive,'w') as z:z.writestr('../escape','bad')
            with self.assertRaises(ValueError):surveys.unzip(archive,root/'out')
            self.assertFalse((root/'escape').exists())

if __name__=='__main__':unittest.main()
