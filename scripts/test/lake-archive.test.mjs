import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertExecutable, writeTilesetArchive } from "../lib/lake-archive.mjs";

async function withTemporaryDirectory(body) {
  const directory = await mkdtemp(join(tmpdir(), "topostack-lake-archive-"));
  try { return await body(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}

/** Stands in for tippecanoe: `--output <path>` plus whatever the script does with stdin. */
async function fakeTippecanoe(directory, body) {
  const command = join(directory, "fake-tippecanoe");
  await writeFile(command, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return command;
}

const missing = async (path) => { await assert.rejects(access(path), { code: "ENOENT" }); };
const feature = (id) => ({ type: "Feature", properties: { hylak_id: id } });

test("a missing build tool is refused before any input is read", () => {
  assert.throws(() => assertExecutable("topostack-tippecanoe-does-not-exist", { install: "brew install tippecanoe" }),
    /topostack-tippecanoe-does-not-exist is required but could not be started \(ENOENT\)\. Install it with: brew install tippecanoe/);
  // Non-zero `--version` exits differ across tippecanoe builds and are not a failure.
  assertExecutable("sh", { args: ["-c", "exit 3"] });
});

test("a completed run replaces the previous archive and leaves no part file", () => withTemporaryDirectory(async (directory) => {
  const outputPath = join(directory, "lakes.pmtiles");
  await writeFile(outputPath, "previous good archive");
  const command = await fakeTippecanoe(directory, 'cat > "$2"');
  const counts = await writeTilesetArchive({
    outputPath, command, args: ["--layer", "lakes"],
    emit: async (write) => {
      await write(feature(1));
      await write(feature(2));
      return { kept: 2, skipped: 0 };
    },
  });
  assert.deepEqual(counts, { kept: 2, skipped: 0 });
  assert.deepEqual((await readFile(outputPath, "utf8")).trim().split("\n").map((line) => JSON.parse(line).properties.hylak_id), [1, 2]);
  await missing(`${outputPath}.part`);
}));

test("a failed run keeps the previous archive instead of a partial one", () => withTemporaryDirectory(async (directory) => {
  const outputPath = join(directory, "lakes.pmtiles");
  await writeFile(outputPath, "previous good archive");
  // Writes a partial archive, then fails the way a full disk or a bad feature would.
  const command = await fakeTippecanoe(directory, 'head -c 5 > "$2"\nexit 1');
  await assert.rejects(writeTilesetArchive({
    outputPath, command,
    emit: async (write) => { for (let id = 0; id < 200; id += 1) await write(feature(id)); },
  }), /exited with code 1|EPIPE/);
  assert.equal(await readFile(outputPath, "utf8"), "previous good archive");
  await missing(`${outputPath}.part`);
}));

test("a failure while producing features never promotes the part file", () => withTemporaryDirectory(async (directory) => {
  const outputPath = join(directory, "lakes.pmtiles");
  await writeFile(outputPath, "previous good archive");
  const command = await fakeTippecanoe(directory, 'cat > "$2"');
  await assert.rejects(writeTilesetArchive({
    outputPath, command,
    emit: async (write) => { await write(feature(1)); throw new Error("shapefile read failed"); },
  }), /shapefile read failed/);
  assert.equal(await readFile(outputPath, "utf8"), "previous good archive");
  await missing(`${outputPath}.part`);
}));

test("an unusable binary reports the spawn failure instead of crashing unhandled", () => withTemporaryDirectory(async (directory) => {
  const outputPath = join(directory, "lakes.pmtiles");
  await assert.rejects(writeTilesetArchive({
    outputPath, command: join(directory, "not-installed"),
    emit: async (write) => { await write(feature(1)); },
  }), (error) => error.code === "ENOENT");
  await missing(`${outputPath}.part`);
  await missing(outputPath);
}));
