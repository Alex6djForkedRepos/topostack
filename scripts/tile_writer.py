"""Shared raster tile helpers for the survey bathymetry and HRDEM terrain builders.

Encodes float grids as Terrarium-style RGBA PNG tiles in an MBTiles staging
database, then converts and verifies a PMTiles archive with a receipt.
Has no import-time side effects so either builder can import it directly.
"""
import hashlib
import io
import json
import math
import sqlite3
import subprocess

import numpy as np
from PIL import Image
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling, transform_bounds

WORLD = 20037508.342789244


def digest(path):
    with path.open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def encode(values, elevation=False):
    valid = np.isfinite(values) & (values >= (-500 if elevation else 0)) & (values <= (9000 if elevation else 1500))
    code = np.rint((np.where(valid, values, 0) + 32768) * 256).astype(np.uint32)
    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3] = code >> 16, (code >> 8) & 255, code & 255, valid * 255
    return rgba


def write_grid(path, values, transform, crs):
    path.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(path, 'w', driver='GTiff', height=values.shape[0], width=values.shape[1], count=1,
                       dtype='float32', crs=crs, transform=transform, nodata=np.nan, compress='deflate', tiled=True) as dst:
        dst.write(values.astype(np.float32), 1)
    return path


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

    def merge_tiles(self, database, grid):
        """Merge an independently prepared grid's tiles in original priority order."""
        with sqlite3.connect(f'file:{database}?mode=ro', uri=True) as source:
            for z, x, y, data in source.execute('SELECT zoom_level,tile_column,tile_row,tile_data FROM tiles ORDER BY zoom_level,tile_column,tile_row'):
                old = self.db.execute('SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?', (z,x,y)).fetchone()
                if old:
                    rgba = np.array(Image.open(io.BytesIO(data)))
                    previous = np.array(Image.open(io.BytesIO(old[0])))
                    rgba[previous[..., 3] > 0] = previous[previous[..., 3] > 0]
                    buffer = io.BytesIO()
                    Image.fromarray(rgba).save(buffer, format='PNG', optimize=True)
                    data = buffer.getvalue()
                self.db.execute('INSERT OR REPLACE INTO tiles VALUES(?,?,?,?)', (z,x,y,data))
        self.db.commit()
        self.grids.append(grid)

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
