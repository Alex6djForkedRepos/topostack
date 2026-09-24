---
type: improvement
title: Faster generation for large terrain maps
---
Large maps spend less time checking contour boundaries, arranging material nests, placing labels, and clipping roads across many layers. Changes to annotations and fabrication settings reuse terrain calculations when the map data and terrain settings are unchanged. Terrain detail and material-clearance rules stay the same. Large stacks also spread alignment guides and elevation-label searches across available processor cores, with automatic fallback when parallel workers are unavailable.
