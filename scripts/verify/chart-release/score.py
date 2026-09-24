"""Score the frozen source review against held-out publisher QA soundings."""
import importlib.util
import json
from pathlib import Path

import numpy as np

spec = importlib.util.spec_from_file_location("chart_accuracy", Path(__file__).parent.parent / "chart-accuracy/evaluate.py")
accuracy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(accuracy)
result = json.loads(Path('.topostack/chart-release/king-reviewed-record.json').read_text())
metrics, _ = accuracy.score(result['record'], np.load('.topostack/chart-accuracy/king-city-qa.npy'))
Path('.topostack/chart-release/king-accuracy.json').write_text(json.dumps(metrics, indent=2) + '\n')
expected = json.loads(Path('docs/reports/chart-first-release-2026-09-23.json').read_text())['metrics']
assert metrics == expected, 'Measured results changed: inspect before updating the dated report.'
print(json.dumps(metrics, indent=2))
