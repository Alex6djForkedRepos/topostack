import assert from "node:assert/strict";
import test from "node:test";
import { satisfiesEngines } from "../check-node.mjs";

const engines = "^22.22.2 || ^24.15.0 || >=26.0.0";

test("accepts supported Node releases", () => {
  for (const version of ["v22.22.2", "v22.30.0", "v24.15.0", "v26.0.0", "v27.1.0"]) assert.equal(satisfiesEngines(version, engines), true, version);
});

test("rejects Node releases without native type stripping support", () => {
  for (const version of ["v22.14.0", "v20.20.0", "v23.9.0", "v24.14.9", "v25.0.0"]) assert.equal(satisfiesEngines(version, engines), false, version);
});
