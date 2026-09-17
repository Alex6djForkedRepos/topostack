import { beforeEach } from "vitest";
import { setEdgeCacheEnabled } from "../src/edge-cache";
import { resetTerrainRefusals } from "../src/terrain-refusal";

// Cache API entries outlive each test's R2 fixtures, so suites that exercise
// the edge layer enable it themselves and use keys no other test touches.
setEdgeCacheEnabled(false);

// Refused clients are remembered per isolate, which tests share: without this a
// suite that denies the terrain budget would refuse later tests' requests too.
beforeEach(() => resetTerrainRefusals());
