"""NOAA electronic navigational chart (ENC) depths for lakes without a survey grid.

Charts carry depth contours (DEPCNT, VALDCO), spot soundings (SOUNDG) and depth
areas (DEPARE) in metres below the chart's sounding datum. A lake's points come
from its most detailed cells first: a coarser cell contributes only where no
finer cell charts depth. The lake shoreline is added at 0 m, and
survey_regions.contour_grid interpolates linearly inside the outline, as for the
regional contour sources. See docs/reports/noaa-chart-lake-coverage-2026-09-24.md.
"""
import glob
import math
import os
import tempfile
import zipfile

import numpy as np
from rasterio.warp import transform_geom
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from survey_regions import contour_grid, line_parts

# Updates (.001, .002 ...) are applied; soundings arrive one point per depth.
S57_OPTIONS = 'SPLIT_MULTIPOINT=ON,ADD_SOUNDG_DEPTH=ON,UPDATES=APPLY,RETURN_PRIMITIVES=OFF'
# Same rule as the NBS builder: a lake mostly charted as drying is not at its datum.
MAX_DRYING_SHARE = 0.25
# Shoreline vertices at 0 m, no further apart than this, keep interpolation inside the lake.
SHORE_SPACING_M = 100
RESOLUTION_M = 20


def read_cell(archive, name):
    """Depth features of one ENC cell in lon/lat: areas (d1, d2, polygon), contours (depth, line), soundings (depth, point)."""
    import fiona
    os.environ['OGR_S57_OPTIONS'] = S57_OPTIONS
    with tempfile.TemporaryDirectory() as tmp:
        with zipfile.ZipFile(archive) as bundle:
            members = [member for member in bundle.namelist() if f'/{name}.' in member]
            for member in members:
                if os.path.isabs(member) or '..' in member.split('/'):
                    raise ValueError(f'Unsafe ENC member: {member}')
            bundle.extractall(tmp, members)
        base = glob.glob(f'{tmp}/**/{name}.000', recursive=True)
        if not base:
            raise ValueError(f'No base cell in {archive}')
        layers = set(fiona.listlayers(base[0]))

        def features(layer):
            if layer not in layers:
                return []
            with fiona.open(base[0], layer=layer) as src:
                return [(f['properties'], shape(f['geometry'])) for f in src if f['geometry']]
        with fiona.open(base[0], layer='DSID') as src:
            dsid = next(iter(src))['properties']
        if dsid.get('DSPM_DUNI') not in (None, 1):
            raise ValueError(f'{name}: depths are not in metres')
        return {
            'name': name,
            'scale': dsid.get('DSPM_CSCL'),
            'soundingDatum': dsid.get('DSPM_SDAT'),
            'edition': dsid.get('DSID_EDTN'), 'update': dsid.get('DSID_UPDN'),
            'areas': [(p.get('DRVAL1'), p.get('DRVAL2'), g.buffer(0)) for p, g in features('DEPARE')
                      if g.geom_type in ('Polygon', 'MultiPolygon')],
            'contours': [(p['VALDCO'], g) for p, g in features('DEPCNT') if p.get('VALDCO') is not None],
            'soundings': [(p['DEPTH'], g) for p, g in features('SOUNDG') if p.get('DEPTH') is not None],
        }


def charted(cell):
    """Where a cell charts depth: its depth areas deeper than 0 m."""
    return unary_union([g for d1, d2, g in cell['areas'] if d2 is not None and d2 > 0])


def drying_share(cells, lake):
    """Share of the lake's charted area that is charted as drying (bed above datum)."""
    wet = unary_union([charted(cell) for cell in cells]).intersection(lake)
    dry = unary_union([g for cell in cells for d1, d2, g in cell['areas'] if d1 is not None and d1 < 0]).intersection(lake)
    return dry.area / wet.area if wet.area else 0.0


def lake_points(cells, lake):
    """(lon, lat, depth) samples for a lake, detailed cells first; coarser cells fill only uncharted parts."""
    points, covered = [], None
    for cell in sorted(cells, key=lambda item: item['scale']):
        area = charted(cell).intersection(lake)
        if area.is_empty:
            continue
        region = area if covered is None else area.difference(covered)
        if not region.is_empty:
            for depth, line in cell['contours']:
                if depth > 0 and line.intersects(region):
                    for part in line_parts(line.intersection(region)):
                        points.extend((x, y, depth) for x, y in part.coords)
            for depth, point in cell['soundings']:
                if depth > 0 and region.contains(point):
                    points.append((point.x, point.y, depth))
        covered = area if covered is None else covered.union(area)
    return points


def shoreline(water, spacing=SHORE_SPACING_M):
    """0 m samples along every ring of a projected outline, including islands."""
    rings = []
    for polygon in getattr(water, 'geoms', [water]):
        rings.append(polygon.exterior)
        rings.extend(polygon.interiors)
    samples = []
    for ring in rings:
        steps = max(4, math.ceil(ring.length / spacing))
        samples.extend((p.x, p.y, 0.0) for p in (ring.interpolate(i / steps, normalized=True) for i in range(steps)))
    return samples


def utm_crs(longitude, latitude):
    zone = min(60, max(1, math.floor((longitude + 180) / 6) + 1))
    return f"EPSG:{32600 + zone if latitude >= 0 else 32700 + zone}"


def lake_grid(cells, lake, resolution=RESOLUTION_M):
    """Depth grid for a lon/lat lake polygon from its chart cells, or a reason it cannot be built."""
    drying = drying_share(cells, lake)
    if drying > MAX_DRYING_SHARE:
        return None, f'{round(drying * 100)}% of the charted lake is drying; the lake surface is not the chart datum'
    samples = lake_points(cells, lake)
    if len(samples) < 3:
        return None, 'No charted contours or soundings inside the lake'
    centre = lake.representative_point()
    crs = utm_crs(centre.x, centre.y)
    water = shape(transform_geom('EPSG:4326', crs, mapping(lake)))
    projected = shape(transform_geom('EPSG:4326', crs, {'type': 'MultiPoint', 'coordinates': [(x, y) for x, y, _ in samples]}))
    points = [(p.x, p.y, depth) for p, (_, _, depth) in zip(projected.geoms, samples)] + shoreline(water)
    values, transform = contour_grid(points, water, resolution)
    return (values, transform, crs, len(samples)), None
