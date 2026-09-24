#!/usr/bin/env node
// Ships the licence notices for code the site redistributes in compiled form
// (the sparrow/jagua-rs nesting engine) as dist/licenses/third-party.txt, so
// every deployed copy, including the Atomm package, carries them.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const sources = ["THIRD_PARTY_NOTICES.md", "packages/nest-wasm/THIRD_PARTY_LICENSES.md"];
const output = new URL("apps/generator/dist/licenses/", root);
mkdirSync(output, { recursive: true });
writeFileSync(new URL("third-party.txt", output), sources.map((source) => readFileSync(new URL(source, root), "utf8").trim()).join("\n\n----------------------------------------\n\n") + "\n");
console.log("Wrote dist/licenses/third-party.txt");
