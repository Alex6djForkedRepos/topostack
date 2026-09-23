---
type: fix
title: Read thousands-separated elevations in vector depth charts
---
Vector chart tracing now reads elevations such as `1,020` and `1,028.5 ft`, as printed on USGS reservoir charts. Malformed grouping and large map-grid coordinates remain excluded. Real-chart stress tests and review screenshots document the remaining raster tracing limits.
