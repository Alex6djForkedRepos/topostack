---
type: improvement
title: Review and correct contours before generating lake depths
---
Inspect source contours, correct their values and paths with undo/redo, and align flat charts using known coordinates before generating depths. Native PDF paths can avoid image tracing. Incomplete or conflicting contours block generation, and saving requires a separate layer review. Previously saved charts without review remain available for export but cannot be applied to new terrain generations.
