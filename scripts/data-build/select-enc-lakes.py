#!/usr/bin/env python3
"""Choose the chart-only lakes to build from NOAA ENCs and pin their cells.

Reads the chart coverage data (docs/reports/data/noaa-chart-lakes-*.json),
keeps tier A and B lakes that no other source covers, refuses lakes whose
charts refer soundings to a fixed pool elevation (Lake Mead), assigns regional
datasets, and pins every cell by edition, update and SHA-256 together with
HydroLAKES. See docs/reports/noaa-chart-lake-coverage-2026-09-24.md.
"""
import argparse
import json
from pathlib import Path
import re
import time
import zipfile
from xml.etree import ElementTree

from nbs_inventory import digest
from terrain_release import atomic_write

ROOT = Path(__file__).resolve().parent.parent.parent
CATALOG = 'https://www.charts.noaa.gov/ENCs/ENCProdCat.xml'
HYDROLAKES = {'id': 'hydrolakes', 'url': 'https://data.hydrosheds.org/file/hydrolakes/HydroLAKES_polys_v10_shp.zip',
              'file': 'HydroLAKES_polys_v10_shp.zip', 'shapefile': 'HydroLAKES_polys_v10_shp/HydroLAKES_polys_v10.shp'}
# Soundings tied to an elevation above sea level, not to the water surface: a waterline anchor would misplace the bed.
FIXED_POOL = re.compile(r'Soundings refer to .{0,80}?elevation .{0,80}?above Mean Sea Level', re.I)
DATUM_NOTE = re.compile(r'\n((?:SOUNDING DATUM|(?:CAUTION - )?LOW WATER DATUM)[^\n]*\n.*?)(?:\n\n\n|\Z)', re.S)
GULF = {'LA', 'TX', 'MS', 'AL'}
GREAT_LAKES = {'MI', 'WI', 'OH', 'IL', 'IN', 'MN', 'PA'}
ATLANTIC = {'ME', 'NH', 'MA', 'RI', 'CT', 'NJ', 'DE', 'MD', 'DC', 'VA', 'NC', 'SC', 'GA', 'PR', 'VI'}


def assign_dataset(state, coastal):
    """Regional chart dataset for a lake; None when no region fits."""
    if state == 'FL':
        return 'noaa-enc-florida-v1'
    if state in GULF:
        return 'noaa-enc-gulf-coast-v1'
    if state == 'AK':
        return 'noaa-enc-alaska-v1'
    if state == 'CA':
        return 'noaa-enc-california-v1'
    if state in ('WA', 'OR'):
        return 'noaa-enc-columbia-river-v1'
    if state in ('NY', 'VT'):
        return 'noaa-enc-atlantic-coast-v1' if coastal else 'noaa-enc-new-york-vermont-v1'
    if state in GREAT_LAKES:
        return 'noaa-enc-great-lakes-basin-v1'
    if state in ATLANTIC:
        return 'noaa-enc-atlantic-coast-v1'
    return None


def datum_notes(archive, name):
    """The cell's sounding-datum and low-water-datum notes, whitespace collapsed."""
    with zipfile.ZipFile(archive) as bundle:
        text = ''.join(bundle.read(member).decode('latin-1') for member in bundle.namelist()
                       if member.upper().endswith('.TXT') and f'/{name}/' in member)
    return [' '.join(note.split()) for note in DATUM_NOTE.findall(text.replace('\r', ''))]


def catalog_cells(path):
    cells = {}
    for cell in ElementTree.parse(path).getroot().findall('cell'):
        cells[cell.findtext('name')] = {'status': cell.findtext('status'), 'url': cell.findtext('zipfile_location'),
                                        'title': cell.findtext('lname'), 'scale': int(cell.findtext('cscale')),
                                        'edition': cell.findtext('edtn'), 'update': cell.findtext('updn'),
                                        'issued': cell.findtext('zipfile_datetime_iso8601')}
    return cells


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--coverage', type=Path, default=ROOT / 'docs/reports/data/noaa-chart-lakes-20260924.json')
    parser.add_argument('--catalog', required=True, type=Path, help='ENCProdCat.xml downloaded with the cells')
    parser.add_argument('--cells', required=True, type=Path, help='directory of the downloaded <cell>.zip files')
    parser.add_argument('--hydrolakes-zip', required=True, type=Path)
    parser.add_argument('--out', type=Path, default=ROOT / 'scripts/data/noaa-enc-sources.json')
    args = parser.parse_args()

    catalog = catalog_cells(args.catalog)
    coverage = json.loads(args.coverage.read_text())['lakes']
    candidates = [lake for lake in coverage if lake['tier'] in 'AB' and not lake['coveredBy'] and not lake['possiblyCoveredBy']]
    notes, lakes, cells, skipped = {}, [], {}, []
    for lake in candidates:
        names = lake['cells']
        for name in names:
            if name not in notes:
                notes[name] = datum_notes(args.cells / f'{name}.zip', name)
        lake_notes = sorted({note for name in names for note in notes[name]})
        dataset = assign_dataset(lake['state'], lake['coastal'])
        reason = None
        if any(FIXED_POOL.search(note) for note in lake_notes):
            reason = 'Soundings refer to a fixed pool elevation, not the water surface'
        elif not dataset:
            reason = f"No regional dataset for {lake['region'] or lake['country']}"
        elif any(catalog.get(name, {}).get('status') != 'Active' for name in names):
            reason = 'A chart cell is no longer active'
        if reason:
            skipped.append({'hylakId': lake['hylakId'], 'name': lake['title'], 'reason': reason})
            continue
        for name in names:
            if name not in cells:
                entry = catalog[name]
                cells[name] = {'url': entry['url'], 'sha256': digest(args.cells / f'{name}.zip'), 'title': entry['title'],
                               'scale': entry['scale'], 'edition': entry['edition'], 'update': entry['update'], 'issued': entry['issued']}
        lakes.append({'hylakId': lake['hylakId'], 'dataset': dataset, 'title': lake['title'], 'aliases': lake['aliases'] or [],
                      'region': lake['region'], 'state': lake['state'], 'tier': lake['tier'], 'bounds': lake['bounds'],
                      'datumNotes': lake_notes, 'cells': names})
    datasets = {}
    for lake in lakes:
        datasets.setdefault(lake['dataset'], 0)
        datasets[lake['dataset']] += 1
    pins = {
        'selected': time.strftime('%Y-%m-%d'),
        'catalog': {'url': CATALOG, 'sha256': digest(args.catalog)},
        'hydrolakes': {**HYDROLAKES, 'sha256': digest(args.hydrolakes_zip)},
        'datasets': dict(sorted(datasets.items())),
        'skipped': skipped,
        'lakes': sorted(lakes, key=lambda lake: (lake['dataset'], lake['hylakId'])),
        'cells': dict(sorted(cells.items())),
    }
    atomic_write(args.out, (json.dumps(pins, indent=1, ensure_ascii=False) + '\n').encode())
    args.out.chmod(0o644)
    print(f'{len(lakes)} lakes in {len(datasets)} datasets, {len(cells)} cells, {len(skipped)} skipped -> {args.out}')


if __name__ == '__main__':
    main()
