#!/usr/bin/env python3
"""Build versioned lake survey PMTiles. See docs/lake-bathymetry.md.

Inputs are checksum-pinned USGS, Minnesota DNR, and swisstopo downloads.
Uses an isolated Python environment with scripts/survey-requirements.txt.
"""
import argparse
from collections import defaultdict
import gzip
import hashlib
import io
import json
import math
from pathlib import Path
import sqlite3
import subprocess
import tarfile
import zipfile

import numpy as np
from PIL import Image
import rasterio
from rasterio.features import geometry_mask
from rasterio.merge import merge
from rasterio.transform import from_bounds, from_origin
from rasterio.warp import reproject, Resampling, transform_bounds

ROOT = Path(__file__).parent
CATALOG = json.loads((ROOT / 'data/lake-bathymetry.json').read_text())['sources']
PINS = json.loads((ROOT / 'data/lake-survey-sources.json').read_text())
WORLD = 20037508.342789244


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def download(item, cache):
    path = cache / item['file']
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        partial = path.with_suffix(path.suffix + '.part')
        subprocess.run(['curl', '-fLsS', '--retry', '2', '--max-time', '600', item['url'], '-o', str(partial)], check=True)
        partial.replace(path)
    if digest(path) != item['sha256']:
        raise ValueError(f"Source checksum changed: {item['id']}. Review before updating pins.")
    return path


def unzip(path, target):
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path) as archive:
        for member in archive.infolist():
            dest = (target / member.filename).resolve()
            if not dest.is_relative_to(target.resolve()) or (member.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError('Unsafe ZIP member')
        archive.extractall(target)


def encode(values, elevation=False):
    valid = np.isfinite(values) & (values >= (-500 if elevation else 0)) & (values <= (9000 if elevation else 1500))
    code = np.rint((np.where(valid, values, 0) + 32768) * 256).astype(np.uint32)
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3] = code >> 16, (code >> 8) & 255, code & 255, valid * 255
    return rgba


def depth_from_elevation(values, surface, scale=1):
    result = (surface - values) * scale
    return np.where(np.isfinite(values) & (result >= 0) & (result <= 1500), result, np.nan).astype(np.float32)


def write_grid(path, values, transform, crs):
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(path, 'w', driver='GTiff', height=values.shape[0], width=values.shape[1], count=1,
                       dtype='float32', crs=crs, transform=transform, nodata=np.nan, compress='deflate', tiled=True) as dst:
        dst.write(values.astype(np.float32), 1)
    return path


def read_e00(path):
    """Read the uncompressed floating-point Arc/Info GRD export used by DDS-55."""
    with gzip.open(path, 'rt') as f:
        if not f.readline().startswith('EXP  0') or f.readline().strip() != 'GRD  2':
            raise ValueError('Expected an uncompressed floating-point E00 GRD')
        header = f.readline()
        width, height = int(header[:10]), int(header[10:20])
        if (width, height) != (1992, 3416):
            raise ValueError('Unexpected Tahoe grid dimensions')
        res = [float(v) for v in f.readline().split()]
        left, bottom = [float(v) for v in f.readline().split()]
        right, top = [float(v) for v in f.readline().split()]
        if res != [10, 10] or not math.isclose(right-left, width*10) or not math.isclose(top-bottom, height*10):
            raise ValueError('Unexpected Tahoe grid georeferencing')
        values = np.empty(width * height, dtype=np.float32)
        offset = 0
        while offset < values.size:
            line = f.readline().rstrip('\n')
            if not line or line.startswith('EOG'):
                raise ValueError('Truncated Tahoe grid')
            for start in range(0, len(line), 14):
                if offset == values.size:
                    break
                values[offset] = float(line[start:start+14])
                offset += 1
        values[values < -1e30] = np.nan
        return values.reshape(height, width), from_bounds(left, bottom, right, top, width, height)


class TileWriter:
    def __init__(self, output, source):
        self.output, self.source = output, source
        database = output.with_suffix('.mbtiles')
        if output.exists() or database.exists():
            raise ValueError(f'Output exists; choose a new directory: {output}')
        self.database = database
        self.db = sqlite3.connect(database)
        self.db.executescript('CREATE TABLE metadata(name TEXT,value TEXT); CREATE TABLE tiles(zoom_level INTEGER,tile_column INTEGER,tile_row INTEGER,tile_data BLOB,PRIMARY KEY(zoom_level,tile_column,tile_row));')
        self.grids = []

    def add(self, path, name):
        with rasterio.open(path) as src:
            left, bottom, right, top = transform_bounds(src.crs, 'EPSG:3857', *src.bounds)
            count = 0
            for z in range(self.source['maxZoom'] + 1):
                span = 2 * WORLD / 2**z
                for x in range(max(0, math.floor((left+WORLD)/span)), min(2**z-1, math.floor((right+WORLD)/span))+1):
                    for y in range(max(0, math.floor((WORLD-top)/span)), min(2**z-1, math.floor((WORLD-bottom)/span))+1):
                        transform = from_bounds(x*span-WORLD, WORLD-(y+1)*span, (x+1)*span-WORLD, WORLD-y*span, 256, 256)
                        values = np.full((256, 256), np.nan, dtype=np.float32)
                        reproject(rasterio.band(src, 1), values, src_nodata=np.nan, dst_transform=transform,
                                  dst_crs='EPSG:3857', dst_nodata=np.nan, resampling=Resampling.bilinear, num_threads=1)
                        rgba = encode(values, self.source['encoding'] == 'elevation-terrarium-v1')
                        if not rgba[..., 3].any():
                            continue
                        tms_y = 2**z-1-y
                        old = self.db.execute('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?', (z,x,tms_y)).fetchone()
                        if old:
                            previous = np.array(Image.open(io.BytesIO(old[0])))
                            # Earlier input wins in overlaps; prevents later data erasing coverage.
                            rgba[previous[..., 3] > 0] = previous[previous[..., 3] > 0]
                        buffer = io.BytesIO()
                        Image.fromarray(rgba).save(buffer, format='PNG', optimize=True)
                        self.db.execute('INSERT OR REPLACE INTO tiles VALUES(?,?,?,?)', (z,x,tms_y,buffer.getvalue()))
                        count += 1
            self.db.commit()
            self.grids.append({'name': name, 'bounds': list(transform_bounds(src.crs, 'EPSG:4326', *src.bounds)), 'tilesWritten': count})

    def finish(self, pins):
        metadata = {'name':self.source['name'], 'format':'png', 'type':'overlay', 'version':'1', 'minzoom':str(self.db.execute('SELECT min(zoom_level) FROM tiles').fetchone()[0]),
                    'center':f"{(self.source['bounds'][0]+self.source['bounds'][2])/2},{(self.source['bounds'][1]+self.source['bounds'][3])/2},8",
                    'maxzoom':str(self.source['maxZoom']), 'bounds':','.join(map(str,self.source['bounds'])),
                    'topostack_dataset':self.source['id'], 'topostack_encoding':self.source['encoding'],
                    'attribution':self.source['url'], 'description':self.source['license']}
        self.db.executemany('INSERT INTO metadata VALUES (?,?)', metadata.items())
        count = self.db.execute('SELECT count(*) FROM tiles').fetchone()[0]
        if not count:
            raise ValueError('No survey tiles produced')
        self.db.commit()
        self.db.close()
        subprocess.run(['pmtiles','convert',str(self.database),str(self.output)], check=True)
        subprocess.run(['pmtiles','verify',str(self.output)], check=True)
        receipt = {'dataset':self.source['id'], 'sha256':digest(self.output), 'bytes':self.output.stat().st_size, 'tiles':count,
                   'sources':pins, 'grids':self.grids}
        self.output.with_suffix('.sources.json').write_text(json.dumps(receipt,indent=2)+'\n')
        print(f"Built {self.source['id']}: {count} tiles; SHA256 {receipt['sha256']}", flush=True)


def usgs(source, pin, cache, writer):
    archive = download(pin, cache)
    prepared = cache / f"{pin['id']}-depths.tif"
    if pin['id'] == 'tahoe':
        values, transform = read_e00(archive)
        write_grid(prepared, depth_from_elevation(values,1899),transform,'EPSG:32610')
    else:
        extracted = cache / pin['id']
        unzip(archive, extracted)
        if pin['id'] == 'crater':
            with tarfile.open(extracted/'bathy.tar') as bundle:
                bundle.extractall(extracted, filter='data')
        path = extracted / pin['grid']
        with rasterio.open(path) as src:
            if src.crs.to_epsg() != pin['epsg'] or not math.isclose(src.res[0], pin['resolutionM']):
                raise ValueError('Unexpected survey projection/resolution')
            raw = src.read(1,masked=True).filled(np.nan)
            write_grid(prepared,depth_from_elevation(raw,pin['surface'],pin['scale']),src.transform,src.crs)
    writer.add(prepared,pin['id'])


def swiss(pins, cache, writer):
    for pin in pins:
        archive = download(pin,cache)
        prepared = cache / f"{pin['id']}-10m.tif"
        if not prepared.exists():
            paths = []
            # Stream one native tile at a time out of the ZIP; preserve gaps on resampling.
            tile_dir = cache / 'swiss-prepared'
            tile_dir.mkdir(exist_ok=True)
            with zipfile.ZipFile(archive) as bundle:
                members = sorted(n for n in bundle.namelist() if n.lower().endswith('.asc'))
                if not members:
                    raise ValueError('No Swiss elevation grids')
                for i, name in enumerate(members):
                    with rasterio.MemoryFile(bundle.read(name)) as mem, mem.open() as src:
                        if src.count != 1 or src.res[0] not in (0.5,1,2,3):
                            raise ValueError('Unexpected Swiss grid resolution')
                        shape=(max(1,math.ceil((src.bounds.top-src.bounds.bottom)/10)),max(1,math.ceil((src.bounds.right-src.bounds.left)/10)))
                        data=src.read(1,out_shape=shape,masked=True,resampling=Resampling.average).filled(np.nan)
                        path=tile_dir/f'{i}.tif'
                        write_grid(path,data,from_bounds(*src.bounds,shape[1],shape[0]),'EPSG:2056')
                        paths.append(path)
            merge(paths,res=10,nodata=np.nan,dtype='float32',dst_path=prepared,mem_limit=64,
                  dst_kwds={'compress':'deflate','tiled':True})
            for p in paths:
                p.unlink()
        writer.add(prepared,pin['id'])
        print(f"Swiss grid: {pin['id']}",flush=True)


def minnesota(pin,cache,writer):
    import fiona
    from scipy.interpolate import LinearNDInterpolator
    from scipy.spatial import QhullError
    archive=download(pin,cache)
    extracted=cache/'minnesota'
    if not (extracted/'water_lake_bathymetry.gdb').exists():
        unzip(archive,extracted)
    gdb=extracted/'water_lake_bathymetry.gdb'
    contours=defaultdict(list)
    excluded_contours=0
    with fiona.open(gdb,layer='lake_bathymetric_contours') as layer:
        crs=layer.crs
        for feature in layer:
            depth=-float(feature['properties']['DEPTH'])*0.3048
            if depth<0:
                excluded_contours+=1
                continue  # Positive source elevations are above the mapped waterline.
            if not math.isfinite(depth) or depth>1500:
                raise ValueError('Invalid Minnesota contour depth')
            for line in feature['geometry']['coordinates']:
                contours[feature['properties']['DOWLKNUM']].extend((p[0],p[1],depth) for p in line)
    print(f'Excluded {excluded_contours} above-water contours',flush=True)
    outlines=defaultdict(list)
    with fiona.open(gdb,layer='lake_bathymetric_outline') as layer:
        for feature in layer:
            if feature['properties']['ISLAND']=='Y':
                continue
            outlines[feature['properties']['DOWLKNUM']].append(dict(feature['geometry']))
    skipped=[]
    for i,(lake,points) in enumerate(sorted(contours.items())):
        prepared=cache/'mn-prepared'/f'{lake}.tif'
        if not outlines[lake]:
            skipped.append({'id':lake,'reason':'No water outline'})
            continue
        if not prepared.exists():
            data=np.asarray(points,dtype=np.float64)
            xy,indices=np.unique(data[:,:2],axis=0,return_index=True)
            if len(xy)<3 or data[:,2].max()==0:
                skipped.append({'id':lake,'reason':'Insufficient depth contours'})
                continue
            # Linear interpolation honors survey contour values without inventing depths outside their hull.
            try:
                interpolate=LinearNDInterpolator(xy,data[indices,2],fill_value=np.nan)
            except QhullError:
                skipped.append({'id':lake,'reason':'Degenerate contour geometry'})
                continue
            left,bottom=xy.min(axis=0);right,top=xy.max(axis=0)
            width,height=math.ceil((right-left)/20),math.ceil((top-bottom)/20)
            transform=from_origin(left,top,20,20)
            x=left+(np.arange(width)+0.5)*20
            values=np.empty((height,width),dtype=np.float32)
            for row in range(height):
                values[row]=interpolate(x,np.full(width,top-(row+0.5)*20))
            mask=geometry_mask(outlines[lake],out_shape=values.shape,transform=transform,invert=True)
            values[~mask]=np.nan
            write_grid(prepared,values,transform,crs)
        writer.add(prepared,lake)
        if i%50==0:
            print(f'Minnesota: {i+1}/{len(contours)} basins',flush=True)
    (cache/'minnesota-skipped.json').write_text(json.dumps(skipped,indent=2)+'\n')
    print(f'Minnesota: {len(writer.grids)} basins processed, {len(skipped)} skipped',flush=True)


def finland(pins,cache,writer):
    import fiona
    from shapely.geometry import shape, mapping
    from shapely.ops import unary_union
    from scipy.interpolate import LinearNDInterpolator
    from scipy.spatial import QhullError
    for pin in pins:
        archive=download(pin,cache)
        target=cache/pin['id']
        if not target.exists():unzip(archive,target)
    regions=defaultdict(list)
    with fiona.open(cache/'finland-areas/Syvyysalue.shp') as src:
        crs=src.crs
        for f in src:
            lake=f['properties']['JarviTunnu']
            if lake and f['geometry']:regions[lake].append(shape(f['geometry']))
    skipped=[]
    with fiona.open(cache/'finland-contours/Syvyyskayra.shp') as contours:
        for i,(lake,geometries) in enumerate(sorted(regions.items())):
            prepared=cache/'fi-prepared'/f'{lake}.tif'
            if not prepared.exists():
                water=unary_union([g if g.is_valid else g.buffer(0) for g in geometries])
                if water.is_empty:
                    skipped.append({'id':lake,'reason':'No valid water mask'});continue
                points=[]
                for feature in contours.filter(bbox=water.bounds):
                    line=shape(feature['geometry'])
                    if not water.intersects(line):continue
                    try:depth=float(feature['properties']['Syvyyskayr'].replace(',','.'))
                    except (ValueError,AttributeError):continue
                    if not 0<=depth<=1500:continue
                    clipped=line.intersection(water)
                    parts=list(clipped.geoms) if hasattr(clipped,'geoms') else [clipped]
                    for part in parts:
                        if part.geom_type=='LineString':points.extend((x,y,depth) for x,y in part.coords)
                if len(points)<3 or max((p[2] for p in points),default=0)<=0:
                    skipped.append({'id':lake,'reason':'Insufficient depth contours'});continue
                data=np.asarray(points,dtype=np.float64)
                xy,indices=np.unique(data[:,:2],axis=0,return_index=True)
                try:interpolate=LinearNDInterpolator(xy,data[indices,2],fill_value=np.nan)
                except (QhullError,ValueError):
                    skipped.append({'id':lake,'reason':'Degenerate depth contours'});continue
                left,bottom,right,top=water.bounds
                width,height=math.ceil((right-left)/20),math.ceil((top-bottom)/20)
                if width*height>100_000_000:
                    raise ValueError('Unexpectedly large Finnish lake grid')
                transform=from_origin(left,top,20,20)
                x=left+(np.arange(width)+0.5)*20
                values=np.empty((height,width),dtype=np.float32)
                for row in range(height):values[row]=interpolate(x,np.full(width,top-(row+0.5)*20))
                mask=geometry_mask([mapping(water)],out_shape=values.shape,transform=transform,invert=True)
                values[~mask]=np.nan
                if not np.isfinite(values).any():
                    skipped.append({'id':lake,'reason':'No gridded survey coverage'});continue
                write_grid(prepared,values,transform,crs)
            with rasterio.open(prepared) as check:
                values=check.read(1,masked=True)
                if not values.count() or values.max()<=0:
                    skipped.append({'id':lake,'reason':'No underwater depth contours'});continue
            writer.add(prepared,lake)
            if i%50==0:print(f'Finland: {i+1}/{len(regions)} lakes',flush=True)
    (cache/'finland-skipped.json').write_text(json.dumps(skipped,indent=2)+'\n')
    print(f'Finland: {len(writer.grids)} lakes processed, {len(skipped)} skipped',flush=True)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache',type=Path,required=True)
    parser.add_argument('--out-dir',type=Path,required=True)
    parser.add_argument('--dataset',default='all',choices=['all']+[x['id'] for x in CATALOG if x['id']!='noaa-great-lakes-v1'])
    args=parser.parse_args()
    args.cache.mkdir(parents=True,exist_ok=True);args.out_dir.mkdir(parents=True,exist_ok=True)
    for source in CATALOG:
        if source['id']=='noaa-great-lakes-v1' or args.dataset not in ('all',source['id']):
            continue
        pins=[p for p in PINS if p['dataset']==source['id']]
        if not pins:
            raise ValueError('Missing source pins')
        writer=TileWriter(args.out_dir/f"{source['id']}.pmtiles",source)
        if source['id'].startswith('usgs-'):
            usgs(source,pins[0],args.cache,writer)
        elif source['id']=='swissbathy3d-v1':
            swiss(pins,args.cache,writer)
        elif source['id']=='mn-dnr-lakes-v1':
            minnesota(pins[0],args.cache,writer)
        elif source['id']=='syke-finland-lakes-v1':
            finland(pins,args.cache,writer)
        writer.finish(pins)

if __name__=='__main__':
    main()
