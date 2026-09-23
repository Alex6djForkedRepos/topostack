"""Independent checks of sampling, missing coverage, and spatial weighting."""
import base64
import unittest
import numpy as np
from evaluate import sample, score

def record(values):
    a = np.array(values, dtype='<u2')
    return {'grid': {'width': a.shape[1], 'height': a.shape[0],
                     'bounds': {'west': 0, 'east': 2, 'south': 0, 'north': 2},
                     'depthsDm': base64.b64encode(a.tobytes()).decode()},
            'labels': {'surfaceElevationM': 10}, 'intervalM': 1}

class AccuracyMath(unittest.TestCase):
    def test_ramp_centers_interpolation_and_clamped_boundary(self):
        r = record([[10, 30], [50, 70]])
        actual, _ = sample(r, np.array([[.5, 1.5], [1, 1], [0, 2], [2, 0], [2.01, 0]]))
        np.testing.assert_allclose(actual[:4], [1, 4, 1, 7])
        self.assertTrue(np.isnan(actual[4]))

    def test_missing_neighbor_only_invalidates_positive_weights(self):
        actual, _ = sample(record([[10, 65535], [50, 70]]), np.array([[.5, 1.5], [1, 1], [.5, .5]]))
        self.assertEqual(actual[0], 1)
        self.assertTrue(np.isnan(actual[1]))
        self.assertEqual(actual[2], 5)

    def test_equal_cell_weight_survives_repeated_soundings(self):
        r = record([[10, 30], [50, 70]])
        points = np.array([[.5, 1.5, 9/.3048, 0, 0], [1.5, .5, 5/.3048, 40, 0]])
        one, _ = score(r, points)
        repeated, _ = score(r, np.concatenate([np.repeat(points[:1], 100, axis=0), points[1:]]))
        for key in ['meanErrorM', 'rmseM', 'coverage', 'p95AbsoluteM', 'withinOneNormalizedSheet']:
            self.assertAlmostEqual(one['spatial20m'][key], repeated['spatial20m'][key])
        self.assertAlmostEqual(one['spatial20m']['meanErrorM'], 1)

    def test_missing_predictions_stay_in_coverage_denominator(self):
        r = record([[10, 65535], [50, 70]])
        points = np.array([[.5, 1.5, 9/.3048, 0, 0], [1.5, 1.5, 5/.3048, 40, 0]])
        metrics, _ = score(r, points)
        self.assertEqual(metrics['spatial20m']['coverage'], .5)
        self.assertEqual(metrics['spatial20m']['cells'], 2)

if __name__ == '__main__':
    unittest.main()
