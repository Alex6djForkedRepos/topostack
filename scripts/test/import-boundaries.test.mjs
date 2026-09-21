import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ESLint } from "eslint";

const eslint = new ESLint();
const studioModule = fileURLToPath(new URL("../../apps/generator/src/lib/studio/options.ts", import.meta.url));
const studioPanel = fileURLToPath(new URL("../../apps/generator/src/lib/studio/panels/SetupSection.svelte", import.meta.url));

async function messages(specifier, filePath = studioModule) {
  const statement = `import ${JSON.stringify(specifier)};`;
  const source = filePath.endsWith(".svelte") ? `<script lang="ts">${statement}</script>` : statement;
  const [result] = await eslint.lintText(source, { filePath });
  assert.ok(!result.messages.some((message) => message.fatal), JSON.stringify(result.messages));
  return result.messages.filter((message) => message.ruleId === "no-restricted-imports");
}

test("generator modules and panels reject parent imports regardless of layer name", async () => {
  for (const [specifier, file] of [
    ["../lib/x", studioModule],
    ["..", studioModule],
    ["./../options", studioPanel],
    ["../../hooks.server", studioModule],
    ["../storage/storage", studioModule],
    ["../options", studioPanel],
    ["../../../../../scripts/lib/files.mjs", studioModule],
    ["../../../../../workers/map-api/src/index", studioModule],
  ]) assert.ok((await messages(specifier, file)).length > 0, specifier);
});

test("generator imports allow aliases, siblings, and the external data paths", async () => {
  for (const specifier of [
    "@topostack/core",
    "$lib/storage/storage",
    "./project-patch",
    "../../../static/data/lake-depth-directory.json",
    "../../../../static/data/lake-depth-directory.json",
    "../../../../../scripts/data/lake-bathymetry.json",
    "../../../../../workers/map-api/test/terrain-fixture",
  ]) assert.deepEqual(await messages(specifier), [], specifier);
});

test("workspace source imports stay restricted in both scripts and generator files", async () => {
  const script = fileURLToPath(new URL("./versions.test.mjs", import.meta.url));
  assert.ok((await messages("../../packages/core/src/types.ts", script)).length > 0);
  assert.ok((await messages("../../../../../packages/core/src/types.ts")).length > 0);
});
