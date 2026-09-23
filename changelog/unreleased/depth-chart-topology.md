---
type: improvement
title: Define chart contours directly, including islands and underwater rises
---
Prepare paths without three seed points or a uniform interval. Assign each path as the outer shoreline, an island boundary, or a depth contour with a deeper or shallower interior. Local containment checks support multiple basins and rises while rejecting crossing paths and contours inside land. Innermost interiors hold the last contour value unless an explicit bottom or summit is supplied. Island boundaries persist in saved charts and terrain water polygons. Updated the workflow and technical guides.
