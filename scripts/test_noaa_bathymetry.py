"""Run with the same Python environment as build-noaa-bathymetry.py."""
import importlib.util
from pathlib import Path
import unittest
import sys
import numpy as np

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("builder", Path(__file__).with_name("build-noaa-bathymetry.py"))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class DepthEncodingTest(unittest.TestCase):
    def test_depth_sign_and_missing_land(self):
        raw = np.array([[-60.5, 0, 200, -9999, np.nan, -25]], dtype=np.float32)
        valid = np.array([[True, True, True, False, True, False]])
        pixels = builder.depth_pixels(raw, valid)
        self.assertEqual(pixels[0, :, 3].tolist(), [255, 255, 0, 0, 0, 0])
        values = pixels.astype(float)
        decoded = values[..., 0] * 256 + values[..., 1] + values[..., 2] / 256 - 32768
        self.assertEqual(decoded[0, 0], 60.5)
        self.assertEqual(decoded[0, 1], 0)


if __name__ == "__main__":
    unittest.main()
