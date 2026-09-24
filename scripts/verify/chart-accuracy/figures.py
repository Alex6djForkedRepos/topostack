"""Render measured evidence; reference soundings remain points, never a fabricated surface."""
import json
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator
from evaluate import sample

root = Path('.topostack/chart-accuracy')
out = Path('docs/images/real-depth-charts')
results = json.loads((root/'accuracy-results.json').read_text())
lookup = {r['scenario']: r for r in results}
plt.rcParams.update({'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False})
fig, axes = plt.subplots(1, 3, figsize=(13, 7), layout='constrained')
scenarios = ['viking-crop', 'viking-curated-vector']
for ax, name in zip(axes, scenarios):
    path = Path('scripts/verify/chart-accuracy/fixtures/viking-crop-record.json') if name=='viking-crop' else Path('scripts/data/depth-charts/usgs-lake-viking-2019.json')
    record = json.loads(path.read_text()); record = record.get('record', record)
    points = np.load(root/'viking-qa.npy'); _, grid = sample(record, points)
    bounds = record['grid']['bounds']; extent = [bounds['west'], bounds['east'], bounds['south'], bounds['north']]
    bands = np.minimum(np.floor(grid/np.nanmax(grid)*11), 11)
    ax.imshow(bands, extent=extent, origin='upper', cmap='Blues', vmin=0, vmax=11, interpolation='nearest')
    # Thin display only: all soundings are used in reported metrics.
    ax.scatter(points[::80,0], points[::80,1], s=3, color='#cf632a', alpha=.7, label='QA tracks (display thinned)')
    ax.set_aspect(1/np.cos(np.deg2rad(39.92)))
    ax.set_xlabel('Longitude'); ax.ticklabel_format(useOffset=False)
    metric = lookup[name]['spatial20m']
    title = 'Browser raster crop' if name=='viking-crop' else 'Curated vector + control points'
    ax.set_title(f"{title}\nWithin one normalized layer: {metric['withinOneNormalizedSheet']:.1%}")
axes[0].set_ylabel('Latitude');axes[0].legend(loc='lower left', fontsize=8)
ax=axes[2]; q=np.load(root/'viking-qa.npy'); depth=863.8*.3048-q[:,2]*.3048
bands=np.minimum(np.floor(depth/depth.max()*11),11)
ax.scatter(q[::10,0],q[::10,1],c=bands[::10],s=3,cmap='Blues',vmin=0,vmax=11)
ax.set_xlim(axes[0].get_xlim());ax.set_ylim(axes[0].get_ylim());ax.set_aspect(1/np.cos(np.deg2rad(39.92)));ax.ticklabel_format(useOffset=False)
ax.set_title('Independent USGS QA soundings\nBlank areas have no QA points');ax.set_xlabel('Longitude')
for panel in axes:
    panel.set_xlim(-94.086, -94.053)
    panel.set_ylim(39.909, 39.942)
    panel.xaxis.set_major_locator(MaxNLocator(4))
    panel.set_title(panel.get_title(), fontsize=10)
fig.suptitle('Lake Viking: normalized depth bands reveal basin-shape differences', fontsize=15)
fig.supxlabel('11 depth cuts for an illustrative 12-sheet model. Darker = deeper. Each panel uses its own maximum.\nQA maximum is limited to QA tracks; these plots are diagnostic grids, not manufacturing toolpaths.',fontsize=10)
fig.savefig(out/'viking-accuracy-comparison.png',dpi=160);plt.close(fig)

variants=['original','low-resolution','jpeg-40','blur-1px','rotated-7deg'];lakes=['viking','king-city','hamilton','willow']
a=np.array([[lookup[f'{lake}-{v}']['spatial20m']['withinOneNormalizedSheet']*100 for v in variants]for lake in lakes])
fig,ax=plt.subplots(figsize=(11,4.2),layout='constrained');im=ax.imshow(a,vmin=0,vmax=100,cmap='RdYlGn',aspect='auto')
ax.set_xticks(range(5),['Original crop','900 px','JPEG quality 40','Blur 1 px','Rotate 7°']);ax.set_yticks(range(4),['Viking','King City South','Hamilton','Willow Brook'])
for y in range(4):
 for x in range(5):ax.text(x,y,f'{a[y,x]:.1f}%',ha='center',va='center',color='black',fontweight='bold')
ax.set_title('Appearance robustness: within one normalized layer',pad=16,fontsize=13)
fig.colorbar(im,ax=ax,label='% of covered QA locations')
fig.supxlabel('Actual tracing engine, source-derived labels. Equal weight per occupied 20 m reference cell.\nHamilton has 77.9% reference coverage; others 100%. Coverage does not mean full-lake accuracy.',fontsize=10)
fig.savefig(out/'raster-appearance-stress.png',dpi=160);plt.close(fig)
