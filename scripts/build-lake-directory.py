#!/usr/bin/env python3
"""Build the public lake directory from the exact survey archive receipts and source metadata.

Run after build-survey-bathymetry.py using the same cache and archive directory.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import fiona

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'scripts/data'
SWISS_NAMES = {
    'aegerisee': ('Ägerisee', ['Lake Aegeri']), 'baldeggersee': ('Baldeggersee', ['Lake Baldegg']),
    'bielersee': ('Bielersee / Lac de Bienne', ['Lake Biel']),
    'bodensee': ('Bodensee', ['Lake Constance']), 'brienzersee': ('Brienzersee', ['Lake Brienz']),
    'hallwilersee': ('Hallwilersee', ['Lake Hallwil']), 'lacdejoux': ('Lac de Joux', []),
    'lacleman': ('Lac Léman', ['Lake Geneva', 'Genfersee']),
    'lacneuchatel': ('Lac de Neuchâtel', ['Lake Neuchatel', 'Neuenburgersee']),
    'lagomaggiore': ('Lago Maggiore', ['Lake Maggiore']), 'lungernsee': ('Lungerersee', ['Lungernsee', 'Lake Lungern']),
    'murtensee': ('Murtensee / Lac de Morat', ['Lake Murten']), 'rotsee': ('Rotsee', []),
    'sarnersee': ('Sarnersee', ['Lake Sarnen']), 'sempachersee': ('Sempachersee', ['Lake Sempach']),
    'silsersee': ('Silsersee', ['Lake Sils', 'Lej da Segl']),
    'silvaplanersee': ('Silvaplanersee', ['Lake Silvaplana', 'Lej da Silvaplauna']),
    'thunersee': ('Thunersee', ['Lake Thun']), 'vierwaldstaettersee': ('Vierwaldstättersee', ['Lake Lucerne']),
    'walensee': ('Walensee', ['Lake Walen']), 'zugersee': ('Zugersee', ['Lake Zug']),
    'zuerichsee': ('Zürichsee', ['Lake Zurich']),
}
REGIONS = {'noaa-great-lakes-v1': 'Great Lakes, USA / Canada', 'usgs-crater-lake-v1': 'Oregon, USA',
           'usgs-lake-tahoe-v1': 'California / Nevada, USA', 'usgs-mono-lake-v1': 'California, USA',
           'mn-dnr-lakes-v1': 'Minnesota, USA', 'swissbathy3d-v1': 'Switzerland & border lakes',
           'syke-finland-lakes-v1': 'Finland', 'ontario-lakes-v1': 'Ontario, Canada',
           'nve-norway-lakes-v1': 'Norway', 'twdb-texas-reservoirs-v1': 'Texas, USA',
           'usbr-reservoirs-v1': 'Colorado, USA'}
GROUPS = {key: ('Canada' if key.startswith('ontario') else 'Norway' if key.startswith('nve-') else 'Finland' if key.startswith('syke') else 'Switzerland & border lakes' if key.startswith('swiss') else 'Great Lakes' if key.startswith('noaa') else 'United States') for key in REGIONS}


def build(cache, archives):
    catalog = json.loads((DATA / 'lake-bathymetry.json').read_text())['sources']
    builds = json.loads((DATA / 'lake-survey-builds.json').read_text())
    expected = {item['dataset']: item for item in builds['archives']}
    pins = json.loads((DATA / 'lake-survey-sources.json').read_text())
    # Names must come from the same pinned regional source downloads as the survey build.
    for pin in pins:
        if pin['id'] in ('minnesota', 'finland-areas'):
            with (cache / pin['file']).open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != pin['sha256']:
                    raise ValueError(f"Source checksum mismatch: {pin['id']}")
    mn_names, mn_counties, mn_aliases, fi_names = defaultdict(set), defaultdict(set), defaultdict(set), defaultdict(set)
    with fiona.open(cache / 'minnesota/water_lake_bathymetry.gdb', layer='lake_bathymetric_outline') as features:
        for feature in features:
            p = feature['properties']
            if p['LAKE_NAME']: mn_names[p['DOWLKNUM']].add(p['LAKE_NAME'].strip())
            if p['CTY_NAME']: mn_counties[p['DOWLKNUM']].add(p['CTY_NAME'].strip().title())
    with fiona.open(cache / 'minnesota/water_lake_bathymetry.gdb', layer='lake_bathymetric_contours') as features:
        for feature in features:
            p = feature['properties']
            if p['LAKE_NAME']: mn_aliases[p['DOWLKNUM']].add(p['LAKE_NAME'].strip())
    with fiona.open(cache / 'finland-areas/Syvyysalue.shp') as features:
        for feature in features:
            p = feature['properties']
            if p['SyvMitta_1']: fi_names[p['JarviTunnu']].add(p['SyvMitta_1'].strip())
    sources, lakes = [], []
    for source in catalog:
        dataset = source['id']
        contours = dataset in ('mn-dnr-lakes-v1', 'syke-finland-lakes-v1', 'ontario-lakes-v1', 'nve-norway-lakes-v1', 'twdb-texas-reservoirs-v1', 'usbr-reservoirs-v1')
        sources.append({'id': dataset, 'name': source['name'], 'url': source['url'], 'license': source['license'],
                        'kind': 'contours' if contours else 'grid', 'region': REGIONS[dataset], 'group': GROUPS[dataset]})
        if dataset == 'noaa-great-lakes-v1':
            noaa = json.loads((DATA / 'noaa-great-lakes-sources.json').read_text())
            groups = json.loads((DATA / 'noaa-great-lakes.json').read_text())['lakes']
            grids = [{'name': g['id'], 'bounds': next(p['bounds'] for p in noaa['sources'] if p['id'] == g['id']),
                      'title': f"Lake {g['id'].title()}", 'aliases': [n for n in g['names'] if 'Clair' not in n],
                      'note': 'Draft NOAA grid.' if g.get('draft') else ''} for g in groups]
            # St. Clair is included in NOAA's Erie product. Frame the lake, not the entire Erie archive.
            grids.append({'name': 'st-clair', 'title': 'Lake St. Clair', 'aliases': ['Saint Clair', 'St Clair'],
                          'bounds': [-82.95, 42.25, -82.4, 42.7]})
        else:
            receipt = json.loads((archives / f'{dataset}.sources.json').read_text())
            if receipt['sha256'] != expected[dataset]['sha256'] or len(receipt['grids']) != expected[dataset]['processedGrids']:
                raise ValueError(f'Archive receipt does not match the integrated build: {dataset}')
            grids = receipt['grids']
        for grid in grids:
            if grid.get('tilesWritten', 1) <= 0: continue
            key = grid['name']
            region, aliases, note = REGIONS[dataset], [], grid.get('note', '')
            if dataset == 'mn-dnr-lakes-v1':
                names = sorted(mn_names[key])
                if not names: raise ValueError(f'Missing Minnesota name: {key}')
                name = names[0]
                aliases = sorted((set(names[1:]) | mn_aliases[key]) - {name, 'Unnamed', 'UNNAMED'})
                region = ', '.join(sorted(mn_counties[key])) + ' County · Minnesota, USA'
            elif dataset == 'syke-finland-lakes-v1':
                names = sorted(fi_names[key])
                if not names: raise ValueError(f'Missing Finnish name: {key}')
                name, aliases = names[0], names[1:]
            elif dataset == 'swissbathy3d-v1':
                name, aliases = SWISS_NAMES[key.removeprefix('swissbathy3d_')]
                note = 'Coverage follows the published survey footprint, which may cover only part of this lake.'
            elif dataset.startswith('usgs-'):
                name = {'crater': 'Crater Lake', 'tahoe': 'Lake Tahoe', 'mono': 'Mono Lake'}[key]
            else:
                name, aliases = grid['title'], grid['aliases']
            bounds = [round(n, 6) for n in grid['bounds']]
            west, south, east, north = bounds
            if not (-180 <= west < east <= 180 and -85 <= south < north <= 85): raise ValueError(f'Invalid bounds: {key}')
            lakes.append({'id': f'{dataset}:{key}', 'name': name, 'sourceId': dataset, 'surveyId': key,
                          'region': region, 'bounds': bounds, **({'aliases': aliases} if aliases else {}), **({'note': note} if note else {})})
    if len({lake['id'] for lake in lakes}) != len(lakes): raise ValueError('Duplicate directory IDs')
    return {'schemaVersion': 1, 'updated': builds['builtDate'], 'sources': sources, 'lakes': sorted(lakes, key=lambda lake: (lake['name'].casefold(), lake['id']))}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, required=True)
    parser.add_argument('--archives', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'apps/generator/static/data/lake-depth-directory.json')
    args = parser.parse_args()
    result = build(args.cache, args.archives)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    partial = args.output.with_name(args.output.name + '.part')
    partial.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    partial.replace(args.output)
    print(f"Wrote {len(result['lakes'])} lake and basin records from {len(result['sources'])} datasets to {args.output}")
