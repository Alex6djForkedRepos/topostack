import { setEdgeCacheEnabled } from "../src/edge-cache";

// Cache API entries outlive each test's R2 fixtures, so suites that exercise
// the edge layer enable it themselves and use keys no other test touches.
setEdgeCacheEnabled(false);
