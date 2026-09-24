"""Download pinned public sources and render chart crops; run from repo root."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path('.topostack/chart-accuracy')
SOURCES = Path('scripts/verify/chart-accuracy/sources.json')

def fetch(url, target, expected):
    if not target.exists():
        temporary = target.with_suffix(target.suffix + '.part')
        subprocess.run(['curl', '-fL', '--retry', '3', url, '-o', str(temporary)], check=True)
        temporary.replace(target)
    with target.open('rb') as source:
        actual = hashlib.file_digest(source, 'sha256').hexdigest()
    if actual != expected:
        raise ValueError(f'Source checksum mismatch: {target}: {actual}')

ROOT.mkdir(parents=True, exist_ok=True)
configs = json.loads(SOURCES.read_text())
for config in configs:
    name = config['id']
    pdf = ROOT / f'{name}.pdf'
    prior = Path(f'.topostack/real-chart-stress/{name}.pdf')
    if not pdf.exists() and prior.exists():
        shutil.copy(prior, pdf)
    fetch(config['url'], pdf, config['sha256'])
    fetch(config['qa']['url'], ROOT / f'{name}-qa.zip', config['qa']['sourceZipSha256'])
    left, top, right, bottom = config['area']
    subprocess.run(['pdftoppm', '-r', '144', '-x', str(left*2), '-y', str(top*2),
                    '-W', str((right-left)*2), '-H', str((bottom-top)*2), '-png',
                    '-singlefile', str(pdf), str(ROOT / f'{name}-crop')], check=True)
(ROOT / 'configs.json').write_text(json.dumps(configs, indent=2))
