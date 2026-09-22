---
type: fix
title: Keep annotation placement edits and previews reliable
---
Moving a title now preserves text and font changes made in the sidebar. Placement waits for engraving fonts to load and lets you retry a failed download. Title backings clear underlying artwork in the preview, compass resizing stays within valid limits, and Undo and Redo pause until you finish or cancel placement. The placement toolbar now reserves its own space so it cannot cover annotations, including the default scale bar. Committed positions are converted to plain data so worker generation and local saves succeed and placements survive a reload. Placement controls also stay above the flat preview’s zoom controls.
