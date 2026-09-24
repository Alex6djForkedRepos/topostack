#!/usr/bin/env python3
"""Select NOAA NBS lakes for the survey archives and write their pins.

Reads a canonical nbs_inventory.py run over HydroLAKES, keeps every lake whose
surveyed share reaches the threshold, names it from the USGS National
Hydrography Dataset, places it in a county and state from Census TIGERweb,
assigns it to a regional dataset, and pins the scheme, HydroLAKES and every
tile and attribute table the build will read. See docs/noaa-lake-integration-plan.md.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

import fiona
from shapely.geometry import Point, box, shape

from nbs_inventory import BUCKET, digest, fetch_scheme, list_keys, read_scheme
from terrain_release import atomic_write

ROOT = Path(__file__).resolve().parent.parent.parent
HYDROLAKES = {'id': 'hydrolakes', 'url': 'https://data.hydrosheds.org/file/hydrolakes/HydroLAKES_polys_v10_shp.zip',
              'file': 'HydroLAKES_polys_v10_shp.zip', 'shapefile': 'HydroLAKES_polys_v10_shp/HydroLAKES_polys_v10.shp'}
NHD = 'https://hydro.nationalmap.gov/arcgis/rest/services/nhd/MapServer'
# Waterbodies (lakes, ponds, reservoirs) first; then areas, which name the bays and bights HydroLAKES counts as lakes.
NHD_LAYERS = (12, 9)
COUNTIES = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query'
# NCEI's Great Lakes grids already serve these; finer NBS tiles for them are a separate decision (plan phase 3).
SERVED_ELSEWHERE = {5: 'Superior', 6: 'Michigan', 7: 'Ontario', 8: 'Huron', 9: 'Erie', 66: 'St. Clair'}
STATES = {
    '01': ('AL', 'Alabama'), '02': ('AK', 'Alaska'), '06': ('CA', 'California'), '09': ('CT', 'Connecticut'),
    '10': ('DE', 'Delaware'), '11': ('DC', 'District of Columbia'), '12': ('FL', 'Florida'), '13': ('GA', 'Georgia'),
    '15': ('HI', 'Hawaii'), '16': ('ID', 'Idaho'), '17': ('IL', 'Illinois'), '18': ('IN', 'Indiana'),
    '22': ('LA', 'Louisiana'), '23': ('ME', 'Maine'), '24': ('MD', 'Maryland'), '25': ('MA', 'Massachusetts'),
    '26': ('MI', 'Michigan'), '27': ('MN', 'Minnesota'), '28': ('MS', 'Mississippi'), '33': ('NH', 'New Hampshire'),
    '34': ('NJ', 'New Jersey'), '36': ('NY', 'New York'), '37': ('NC', 'North Carolina'), '39': ('OH', 'Ohio'),
    '41': ('OR', 'Oregon'), '42': ('PA', 'Pennsylvania'), '44': ('RI', 'Rhode Island'), '45': ('SC', 'South Carolina'),
    '48': ('TX', 'Texas'), '50': ('VT', 'Vermont'), '51': ('VA', 'Virginia'), '53': ('WA', 'Washington'),
    '55': ('WI', 'Wisconsin'), '72': ('PR', 'Puerto Rico'), '78': ('VI', 'U.S. Virgin Islands'),
    '04': ('AZ', 'Arizona'), '05': ('AR', 'Arkansas'), '08': ('CO', 'Colorado'), '19': ('IA', 'Iowa'),
    '20': ('KS', 'Kansas'), '21': ('KY', 'Kentucky'), '29': ('MO', 'Missouri'), '30': ('MT', 'Montana'),
    '31': ('NE', 'Nebraska'), '32': ('NV', 'Nevada'), '35': ('NM', 'New Mexico'), '38': ('ND', 'North Dakota'),
    '40': ('OK', 'Oklahoma'), '46': ('SD', 'South Dakota'), '47': ('TN', 'Tennessee'), '49': ('UT', 'Utah'),
    '54': ('WV', 'West Virginia'), '56': ('WY', 'Wyoming'), '60': ('AS', 'American Samoa'), '66': ('GU', 'Guam'),
    '69': ('MP', 'Northern Mariana Islands'),
}
DATASETS = {
    'noaa-nbs-florida-v1': {'FL'},
    'noaa-nbs-gulf-coast-v1': {'AL', 'MS', 'LA', 'TX'},
    'noaa-nbs-atlantic-coast-v1': {'ME', 'NH', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA', 'DE', 'MD', 'DC', 'VA', 'NC', 'SC', 'GA'},
    'noaa-nbs-great-lakes-basin-v1': {'MN', 'WI', 'IL', 'IN', 'MI', 'OH', 'NY', 'PA', 'ON'},
    'noaa-nbs-california-v1': {'CA'},
    'noaa-nbs-northwest-coast-v1': {'OR', 'WA'},
    'noaa-nbs-inland-northwest-v1': {'ID', 'WA'},
    'noaa-nbs-alaska-v1': {'AK'},
    'noaa-nbs-caribbean-v1': {'PR', 'VI'},
}
# Open water that HydroLAKES clips into coastal "lakes"; such a name is no name for the lake.
OPEN_WATER = re.compile(r'\b(Ocean|Sea)$|^Gulf of ')
# Longitude east of which New York and Pennsylvania drain to the Atlantic rather than the Great Lakes.
GREAT_LAKES_EAST = -76.0
# Longitude east of which Washington lakes are inland (the Cascade crest, roughly).
CASCADES = -121.0


def assign_dataset(state, longitude):
    """Regional dataset for a lake from its state and longitude; None when no region fits."""
    if state in ('NY', 'PA'):
        return 'noaa-nbs-great-lakes-basin-v1' if longitude < GREAT_LAKES_EAST else 'noaa-nbs-atlantic-coast-v1'
    if state == 'WA':
        return 'noaa-nbs-inland-northwest-v1' if longitude > CASCADES else 'noaa-nbs-northwest-coast-v1'
    return next((dataset for dataset, states in DATASETS.items() if state in states), None)


def pick_names(lake, candidates):
    """Main NHD name and aliases for a HydroLAKES polygon.

    The main name is the named waterbody overlapping the lake most, as "Part of"
    that water when the lake covers under a fifth of it. Other named
    waterbodies that lie mostly inside it become aliases, because HydroLAKES
    often merges connected lakes (Butte des Morts into Winnebago).
    """
    scored = []
    for name, geometry in candidates:
        if not name or OPEN_WATER.search(name) or geometry.is_empty:
            continue
        overlap = lake.intersection(geometry).area
        if overlap <= 0:
            continue
        scored.append((overlap, overlap / min(lake.area, geometry.area), overlap / geometry.area, name))
    scored.sort(reverse=True)
    if not scored or scored[0][1] < 0.2:
        return None, []
    main = scored[0][3]
    # A small HydroLAKES fragment of a large named water is not that water.
    if scored[0][2] < 0.2:
        main = f'Part of {main}'
    aliases = sorted({name for _, _, inside, name in scored[1:] if inside >= 0.5 and name != main})
    return main, aliases


def arcgis(url, params, attempts=6):
    query = urllib.parse.urlencode({**params, 'f': 'json'})
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(f'{url}?{query}', timeout=120) as response:
                data = json.loads(response.read())
            if 'error' in data:
                raise OSError(data['error'])
            return data
        except OSError:
            if attempt == attempts - 1:
                raise
            time.sleep(2 ** attempt)


def nhd_candidates(bounds, layer):
    data = arcgis(f'{NHD}/{layer}/query', {'geometry': ','.join(map(str, bounds)), 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
                        'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'GNIS_NAME', 'returnGeometry': 'true',
                        'outSR': 4326, 'maxAllowableOffset': 0.0002, 'where': "GNIS_NAME IS NOT NULL AND GNIS_NAME <> ''"})
    return [(feature['attributes']['GNIS_NAME'], shape({'type': 'Polygon', 'coordinates': feature['geometry']['rings']}).buffer(0))
            for feature in data.get('features', []) if feature.get('geometry')]


def county(point):
    data = arcgis(COUNTIES, {'geometry': f'{point.x},{point.y}', 'geometryType': 'esriGeometryPoint', 'inSR': 4326,
                             'spatialRel': 'esriSpatialRelIntersects', 'outFields': 'NAME,STATE', 'returnGeometry': 'false'})
    features = data.get('features', [])
    return (features[0]['attributes']['NAME'], features[0]['attributes']['STATE']) if features else (None, None)


def nearest_county(geometry):
    """County of the lake's interior point, else of its corners: coastal lagoons can sit outside county polygons."""
    for point in [geometry.representative_point(), *(Point(xy) for xy in box(*geometry.bounds).exterior.coords[:4])]:
        name, state = county(point)
        if state:
            return name, state
    return None, None


def describe(lake):
    geometry = lake['geometry']
    for layer in NHD_LAYERS:
        main, aliases = pick_names(geometry, nhd_candidates(geometry.bounds, layer))
        if main:
            break
    county_name, fips = nearest_county(geometry)
    if fips in STATES:
        abbreviation, state = STATES[fips]
    elif lake['country'] == 'Canada' and geometry.bounds[1] < 49:
        # Canadian shores of the connecting channels, surveyed with the US side.
        abbreviation, state, county_name = 'ON', 'Ontario', None
    else:
        abbreviation, state = None, lake['country']
    # HydroLAKES names are sparse and sometimes shortened ("Pend Oreille Lake"); keep them searchable.
    if lake['name'] and not main:
        main = lake['name']
    elif lake['name'] and lake['name'] != main:
        aliases = sorted(set(aliases) | {lake['name']})
    return {'name': main, 'aliases': aliases, 'county': county_name, 'state': abbreviation, 'stateName': state}


def describe_cached(lake, cache):
    """describe(), remembered per lake so a rerun does not query the services again."""
    path = cache / 'nbs-lake-names' / f"{lake['id']}.json"
    if path.exists():
        return json.loads(path.read_text())
    record = describe(lake)
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(path, json.dumps(record).encode())
    return record


def region_label(record):
    country = 'Canada' if record['state'] == 'ON' else 'USA'
    return f"{record['county']} · {record['stateName']}, {country}" if record['county'] else f"{record['stateName']}, {country}"


def title(record):
    if record['name']:
        return record['name']
    where = record['county'] or record['stateName']
    return f'Unnamed lake, {where}'


def available(url):
    try:
        urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=60).close()
        return True
    except urllib.error.HTTPError as error:
        if error.code in (403, 404):
            return False
        raise


def resolve_replaced(name, tile, cache):
    """Pin for a tile NOAA re-delivered after publishing the scheme.

    The scheme still names the old file, which is gone. Pin the delivery now in
    the bucket by its own digest, and keep the scheme's link for provenance.
    """
    if available(tile['url']) and available(tile['ratUrl']):
        return tile
    prefix = tile['url'].removeprefix(BUCKET + '/').rsplit('/', 1)[0] + '/'
    keys = sorted(key for key, _ in list_keys(prefix))
    tiffs = [key for key in keys if key.endswith('.tiff')]
    if not tiffs or tiffs[-1] + '.aux.xml' not in keys:
        raise SystemExit(f'Tile {name} is gone and has no replacement')
    pinned = {}
    for field, key in (('url', tiffs[-1]), ('ratUrl', tiffs[-1] + '.aux.xml')):
        path = cache / 'nbs-replaced' / Path(key).name
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            urllib.request.urlretrieve(f'{BUCKET}/{key}', path)
        pinned[field] = f'{BUCKET}/{key}'
        pinned['sha256' if field == 'url' else 'ratSha256'] = digest(path)
    print(f'{name}: scheme names {Path(tile["url"]).name}; pinned the current {Path(pinned["url"]).name}')
    return {**tile, **pinned, 'schemeUrl': tile['url']}


def read_polygons(path, ids):
    polygons = {}
    with fiona.open(path) as source:
        for feature in source:
            props = feature['properties']
            if props['Hylak_id'] in ids:
                polygons[props['Hylak_id']] = (shape(feature['geometry']), props['Country'])
    return polygons


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--inventory', required=True, type=Path, help='nbs_inventory.py output measured over HydroLAKES')
    parser.add_argument('--cache', required=True, type=Path, help='the inventory cache holding the scheme GeoPackage')
    parser.add_argument('--hydrolakes-zip', required=True, type=Path)
    parser.add_argument('--hydrolakes', required=True, type=Path, help='the shapefile extracted from that ZIP')
    parser.add_argument('--min-share', type=float, default=0.5)
    parser.add_argument('--out', type=Path, default=ROOT / 'scripts/data/noaa-nbs-sources.json')
    args = parser.parse_args()

    inventory = json.loads(args.inventory.read_text())
    scheme, scheme_path = fetch_scheme(args.cache, inventory['scheme']['product'])
    if scheme != inventory['scheme']:
        raise SystemExit('The published tile scheme changed since the inventory; re-run nbs_inventory.py first.')
    published = {tile['tile']: tile for tile in read_scheme(scheme_path)}

    chosen = []
    for lake in inventory['lakes']:
        coverage = lake['coverage'] or {}
        share = round((lake['footprint'] or 0) * coverage.get('survey', 0), 3)
        if share >= args.min_share and lake['id'] not in SERVED_ELSEWHERE:
            chosen.append({**lake, 'surveyedShare': share})
    polygons = read_polygons(args.hydrolakes, {lake['id'] for lake in chosen})
    for lake in chosen:
        lake['geometry'], lake['country'] = polygons[lake['id']]

    with ThreadPoolExecutor(3) as pool:
        described = list(pool.map(lambda lake: describe_cached(lake, args.cache), chosen))

    lakes, tiles, skipped = [], {}, []
    for lake, record in zip(chosen, described):
        longitude = lake['geometry'].representative_point().x
        dataset = assign_dataset(record['state'], longitude)
        if not dataset:
            skipped.append({'hylakId': lake['id'], 'reason': f"No regional dataset for {record['stateName']}"})
            continue
        names = [tile['tile'] for tile in lake['tiles']]
        for name in names:
            tile = published[name]
            if tile['sha256'] != next(t['sha256'] for t in lake['tiles'] if t['tile'] == name):
                raise SystemExit(f'Tile {name} changed since the inventory')
            tiles[name] = {key: tile[key] for key in ('url', 'sha256', 'ratUrl', 'ratSha256', 'resolution', 'utmZone')}
        lakes.append({'hylakId': lake['id'], 'dataset': dataset, 'title': title(record), 'aliases': record['aliases'],
                      'region': region_label(record), 'state': record['state'], 'surveyedShare': lake['surveyedShare'],
                      'surveyYears': lake['surveyYears'], 'bounds': lake['bounds'], 'tiles': sorted(names)})
    with ThreadPoolExecutor(8) as pool:
        tiles = dict(zip(tiles, pool.map(lambda item: resolve_replaced(*item, args.cache), tiles.items())))
    datasets = {}
    for dataset in DATASETS:
        members = [lake for lake in lakes if lake['dataset'] == dataset]
        if not members:
            continue
        pad = 0.01
        datasets[dataset] = {'lakes': len(members), 'bounds': [
            round(min(lake['bounds'][0] for lake in members) - pad, 3), round(min(lake['bounds'][1] for lake in members) - pad, 3),
            round(max(lake['bounds'][2] for lake in members) + pad, 3), round(max(lake['bounds'][3] for lake in members) + pad, 3)]}
    pins = {
        'selected': time.strftime('%Y-%m-%d'),
        'scheme': scheme,
        'hydrolakes': {**HYDROLAKES, 'sha256': digest(args.hydrolakes_zip)},
        'selection': {'minSurveyedShare': args.min_share, 'servedElsewhere': SERVED_ELSEWHERE,
                      'keep': 'survey cells whose source licence is CC0 or CC BY 4.0'},
        'datasets': datasets,
        'skipped': skipped,
        'lakes': sorted(lakes, key=lambda lake: (lake['dataset'], lake['hylakId'])),
        'tiles': dict(sorted(tiles.items())),
    }
    atomic_write(args.out, (json.dumps(pins, indent=1, ensure_ascii=False) + '\n').encode())
    print(f'{len(lakes)} lakes in {len(datasets)} datasets, {len(tiles)} tiles, {len(skipped)} skipped -> {args.out}')


if __name__ == '__main__':
    main()
