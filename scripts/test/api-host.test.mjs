import assert from "node:assert/strict";
import test from "node:test";
import { isForbiddenApiHost } from "../lib/api-host.mjs";

test("rejects loopback, reserved placeholder, and Workers preview hosts", () => {
  for (const host of ["localhost", "LOCALHOST", "127.0.0.1", "::1", "[::1]", "api.localhost", "ci.invalid", "invalid",
    "map.test", "box.local", "api.example", "example.com", "api.example.org", "topostack.user.workers.dev", "workers.dev"]) {
    assert.equal(isForbiddenApiHost(host), true, host);
  }
});

test("accepts deployed production hosts", () => {
  for (const host of ["topostack.echofoxtrot.works", "dev-topostack.echofoxtrot.works", "api.testing.com", "localhosting.net"]) {
    assert.equal(isForbiddenApiHost(host), false, host);
  }
});
