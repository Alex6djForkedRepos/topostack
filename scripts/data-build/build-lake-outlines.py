#!/usr/bin/env python3
"""Publish pinned survey water masks, independently of raster/depth metadata.

Uses the same source downloads and directory as the survey build. Never derives
shorelines from raster validity or rectangular survey bounds. See lake-bathymetry.md.
"""
import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import re

import fiona
from rasterio.warp import transform_geom
from shapely import build_area
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent.parent
DATA = ROOT / 'scripts/data'
SHARD_NAME = re.compile(r'^[0-9a-f]{24}\.json$')


def clean_water(water, islands=()):
    water = unary_union([g if g.is_valid else g.buffer(0) for g in water])
    if islands:
        water = water.difference(unary_union(islands))
    return water


def read_masks(cache, pins):
    """Yield (dataset, survey ID, water mask, CRS); masks may be partial coverage."""
    for pin in pins:
        dataset = pin['dataset']
        if pin['id'] == 'minnesota':
            water, islands = defaultdict(list), defaultdict(list)
            with fiona.open(cache / 'minnesota/water_lake_bathymetry.gdb', layer='lake_bathymetric_outline') as src:
                crs = src.crs
                for feature in src:
                    if feature['geometry']:
                        p = feature['properties']
                        (islands if p['ISLAND'] == 'Y' else water)[str(p['DOWLKNUM'])].append(shape(feature['geometry']))
            for key, geometries in water.items():
                yield dataset, key, clean_water(geometries, islands[key]), crs
        elif pin['id'] == 'finland-areas':
            water = defaultdict(list)
            with fiona.open(cache / 'finland-areas/Syvyysalue.shp') as src:
                crs = src.crs
                for feature in src:
                    if feature['geometry'] and feature['properties']['JarviTunnu']:
                        water[str(feature['properties']['JarviTunnu'])].append(shape(feature['geometry']))
            for key, geometries in water.items():
                yield dataset, key, clean_water(geometries), crs
        elif pin.get('role') == 'areas':
            norway = dataset == 'nve-norway-lakes-v1'
            records = defaultdict(list)
            with fiona.open('/vsigzip/' + str((cache / pin['file']).resolve())) as src:
                crs = src.crs
                for feature in src:
                    p = feature['properties']
                    key = p['vatnlnr' if norway else 'WBY_LID']
                    if not key or not feature['geometry'] or (not norway and p.get('BATHYMETRY_LINE_IND') != 'Yes'):
                        continue
                    records[str(key)].append((p.get('SURVEY_YEAR') or 0, shape(feature['geometry'])))
            for key, entries in records.items():
                latest = max(year for year, _ in entries)
                yield dataset, key, clean_water([g for year, g in entries if norway or year == latest]), crs
        elif dataset in ('twdb-texas-reservoirs-v1', 'usbr-reservoirs-v1'):
            root = cache / 'reservoirs' / pin['id'] / pin['sha256'][:12]
            if pin.get('maskPath'):
                with fiona.open(root / pin['maskPath']) as src:
                    crs = src.crs
                    water = clean_water([shape(f['geometry']) for f in src if f['geometry']])
            else:
                # Same closed reference contour used by the depth builder. This
                # is a conservative survey mask, not a present-day water level.
                with fiona.open(root / pin['path'], **({'layer': pin['layer']} if pin.get('layer') else {})) as src:
                    crs = src.crs
                    outlines = [shape(f['geometry']) for f in src if f['geometry'] and f['properties'][pin['field']] is not None
                                and abs(float(f['properties'][pin['field']]) - pin['maskElevation']) < 0.001]
                water = build_area(unary_union(outlines))
                if water.geom_type == 'MultiPolygon':
                    water = max(water.geoms, key=lambda g: g.area)
            yield dataset, pin['id'], water, crs


def write_atomic(target, payload):
    partial = target.with_name(target.name + '.part')
    try:
        partial.write_bytes(payload)
        partial.replace(target)
    except BaseException:
        partial.unlink(missing_ok=True)
        raise


def publish_shards(output, features):
    """Write content-addressed shards, then swap the index, then prune stale shards.

    Readers see either the previous index (whose shards still exist) or the new
    one. Only files matching the shard naming pattern are ever removed.
    """
    output.mkdir(parents=True, exist_ok=True)
    chunks = defaultdict(list)
    for identity, feature in sorted(features.items()):
        w, s, e, n = feature['bbox']
        chunks[(feature['properties']['sourceId'], math.floor((w+e)/2), math.floor((s+n)/2))].append(feature)
    shards = []
    for key, records in sorted(chunks.items()):
        for start in range(0, len(records), 32):
            batch = records[start:start+32]
            payload = (json.dumps({'type': 'FeatureCollection', 'features': batch}, separators=(',', ':'), ensure_ascii=False) + '\n').encode()
            filename = hashlib.sha256(payload).hexdigest()[:24] + '.json'
            write_atomic(output / filename, payload)
            boxes = [f['bbox'] for f in batch]
            bounds = [min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)]
            shards.append({'file': filename, 'bounds': bounds, 'sourceId': key[0], 'count': len(batch)})
    write_atomic(output / 'index.json', (json.dumps({'schemaVersion': 1, 'shards': shards}, separators=(',', ':')) + '\n').encode())
    referenced = {shard['file'] for shard in shards}
    for path in output.iterdir():
        if path.is_file() and SHARD_NAME.match(path.name) and path.name not in referenced:
            path.unlink()
    return shards


def build(caches, output, directory):
    pins = json.loads((DATA / 'lake-survey-sources.json').read_text())
    lakes = {lake['id']: lake for lake in directory['lakes']}
    supported = {'mn-dnr-lakes-v1', 'syke-finland-lakes-v1', 'nve-norway-lakes-v1', 'ontario-lakes-v1',
                 'twdb-texas-reservoirs-v1', 'usbr-reservoirs-v1'}
    grouped = defaultdict(list)
    # Verify the original source bytes before trusting their extracted masks.
    for pin in pins:
        if pin['dataset'] not in supported or pin['id'].endswith('-contours'):
            continue
        cache = next((c for c in caches if (c / pin['file']).exists()), None)
        if cache is None:
            raise ValueError(f"Missing pinned source: {pin['file']}")
        with (cache / pin['file']).open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != pin['sha256']:
                raise ValueError(f"Source checksum mismatch: {pin['id']}")
        grouped[cache].append(pin)
    features = {}
    for cache, source_pins in grouped.items():
        for dataset, key, water, crs in read_masks(cache, source_pins):
            identity = f'{dataset}:{key}'
            if identity not in lakes:
                continue
            if water.is_empty or water.geom_type not in ('Polygon', 'MultiPolygon'):
                raise ValueError(f'Invalid water mask: {identity}')
            # Simplify in metres; keep topology and islands. Five metres is below
            # the 10–20 m serving resolution of these regional survey rasters.
            projected = shape(transform_geom(crs, 'EPSG:3857', mapping(water)))
            latitude = shape(transform_geom(crs, 'EPSG:4326', mapping(water))).centroid.y
            projected = projected.simplify(5 / max(0.1, math.cos(math.radians(latitude))), preserve_topology=True)
            geometry = transform_geom('EPSG:3857', 'EPSG:4326', mapping(projected), precision=7)
            final = shape(geometry)
            if not final.is_valid:
                final = final.buffer(0)
                geometry = mapping(final)
            if not final.is_valid or final.is_empty:
                raise ValueError(f'Invalid simplified mask: {identity}')
            features[identity] = {'type': 'Feature', 'bbox': list(final.bounds), 'properties': {
                'sourceId': dataset, 'surveyId': key, 'name': lakes[identity]['name'],
            }, 'geometry': dict(geometry)}
    missing = sorted(key for key, lake in lakes.items() if lake['sourceId'] in supported and key not in features)
    if missing:
        raise ValueError(f'Missing provider masks for {len(missing)} directory entries: {missing[:10]}')
    shards = publish_shards(output, features)
    audit = {'schemaVersion': 1, 'directoryEntries': len(lakes), 'providerOutlines': len(features), 'shards': len(shards),
             'entries': [{'id': key, 'outline': 'provider' if key in features else 'external-fallback',
                          **({'reason': 'Grid source has no shoreline in the pinned inputs; use HydroLAKES or OSM.'} if key not in features else {})}
                         for key in sorted(lakes)]}
    write_atomic(DATA / 'lake-outline-coverage.json', (json.dumps(audit, indent=2, ensure_ascii=False) + '\n').encode())
    print(f"Published {len(features)} provider outlines in {len(shards)} shards; {len(lakes)-len(features)} grid-source entries require external shorelines.")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, action='append', required=True)
    parser.add_argument('--output', type=Path, default=ROOT / '.topostack/lake-outlines')
    args = parser.parse_args()
    directory = json.loads((ROOT / 'apps/generator/static/data/lake-depth-directory.json').read_text())
    build(args.cache, args.output, directory)
