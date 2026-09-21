import assert from "node:assert/strict";
import test from "node:test";
import { CANONICAL_ZONE, LEGACY_ZONE, WWW_DNS_RECORD, WWW_HOST, mergeRedirectRules, redirectRulesByZone } from "../build/configure-redirects.mjs";

test("redirects each legacy host to its canonical origin but serves the API in place", () => {
  const [production, development] = redirectRulesByZone()[LEGACY_ZONE];
  assert.match(production.expression, /http\.host eq "topostack\.echofoxtrot\.works"/);
  assert.equal(production.action_parameters.from_value.target_url.expression, 'concat("https://topostack.app", http.request.uri.path)');
  assert.match(development.expression, /http\.host eq "dev-topostack\.echofoxtrot\.works"/);
  assert.equal(development.action_parameters.from_value.target_url.expression, 'concat("https://dev.topostack.app", http.request.uri.path)');
  for (const rule of [production, development]) {
    assert.equal(rule.action_parameters.from_value.status_code, 301);
    assert.equal(rule.action_parameters.from_value.preserve_query_string, true);
    assert.match(rule.expression, /not starts_with\(http\.request\.uri\.path, "\/v1\/"\)/);
    assert.match(rule.expression, /"\/health" "\/ready"/);
  }
});

test("redirects every www path to the apex, with no API exclusion", () => {
  const [www, ...rest] = redirectRulesByZone()[CANONICAL_ZONE];
  assert.deepEqual(rest, []);
  assert.equal(www.ref, "topostack_www");
  assert.equal(www.expression, `(http.host eq "${WWW_HOST}")`);
  assert.equal(www.action_parameters.from_value.target_url.expression, 'concat("https://topostack.app", http.request.uri.path)');
  assert.equal(www.action_parameters.from_value.status_code, 301);
  assert.equal(www.action_parameters.from_value.preserve_query_string, true);
});

test("the www placeholder record is proxied so the redirect rule can run", () => {
  assert.equal(WWW_DNS_RECORD.proxied, true);
  assert.equal(WWW_DNS_RECORD.name, "www");
  assert.equal(WWW_DNS_RECORD.content, "100::");
});

test("keeps unrelated zone rules and replaces earlier TopoStack rules", () => {
  const other = { id: "a", ref: "blog", description: "Blog", expression: "true", action: "redirect", action_parameters: {}, enabled: true, version: "3", last_updated: "x" };
  const stale = { id: "b", ref: "topostack_legacy_topostack_echofoxtrot_works", expression: "false", action: "redirect" };
  const desired = redirectRulesByZone()[LEGACY_ZONE];
  const merged = mergeRedirectRules([other, stale], desired);
  assert.deepEqual(merged[0], { id: "a", ref: "blog", description: "Blog", expression: "true", action: "redirect", action_parameters: {}, enabled: true });
  assert.equal(merged.length, 3);
  assert.deepEqual(merged.slice(1), desired);
});
