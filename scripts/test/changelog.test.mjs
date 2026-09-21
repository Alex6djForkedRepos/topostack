import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import {
  changelogMarkdown, checkBranch, inferPullRequest, newFragment, notesBetween, notesFor, prepareRelease,
  readChangelog, readFragments, verifyRelease, writeReleaseFiles,
} from "../release/changelog.mjs";
import { nextVersion, readVersions } from "../release/versions.mjs";

const VERSION_FILES = ["package.json", "package-lock.json", "apps/generator/package.json", "packages/core/package.json", "packages/data-contracts/package.json", "workers/map-api/package.json", "atomm/version.json"];
const fragment = (type, title, body = "Something a maker notices.") => `---\ntype: ${type}\ntitle: ${title}\n---\n${body}\n`;

/** A throwaway git repository with the real version files and a one-release changelog. */
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "topostack-changelog-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const base = pathToFileURL(directory + "/");
  const git = (...args) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  for (const path of ["apps/generator", "packages/core", "packages/data-contracts", "workers/map-api", "atomm", "changelog/unreleased"]) await mkdir(new URL(path, base), { recursive: true });
  for (const path of VERSION_FILES) await writeFile(new URL(path, base), await readFile(new URL(`../../${path}`, import.meta.url)));
  const { version } = await readVersions(base);
  await writeFile(new URL("changelog/unreleased/.gitkeep", base), "");
  await writeFile(new URL("changelog/releases.json", base), JSON.stringify({ schemaVersion: 1, releases: [
    { version, date: "2026-09-01", entries: [{ type: "feature", title: "First", body: "The [first](/guides) release." }] },
  ] }));
  await writeReleaseFiles(await readChangelog(base), base);
  git("init", "-q", "-b", "dev");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("add", ".");
  git("commit", "-qm", "Initial");
  return { base, directory, git, version };
}

async function addOnBranch({ base, git }, branch, files, pr) {
  git("checkout", "-qb", branch);
  for (const [name, text] of Object.entries(files)) await writeFile(new URL(`changelog/unreleased/${name}`, base), text);
  git("add", ".");
  git("commit", "-qm", `Work on ${branch}`);
  if (pr === undefined) return;
  git("checkout", "-q", "dev");
  git("merge", "-q", "--no-ff", branch, "-m", `Merge pull request #${pr} from org/${branch}`);
}

test("prepare folds fragments into a release, infers pull requests, and bumps every workspace", async (t) => {
  const repo = await fixture(t);
  await addOnBranch(repo, "feat/tracks", { "tracks.md": fragment("feature", "Tracks") }, 7);
  await addOnBranch(repo, "fix/edge", { "edge.md": fragment("fix", "Edge") }, 5);
  await writeFile(new URL("changelog/unreleased/pinned.md", repo.base), `---\ntype: fix\ntitle: Pinned\npr: 3\n---\nKept.\n`);

  const dry = await prepareRelease({ base: repo.base, date: "2026-09-21", dryRun: true });
  assert.equal(dry.version, nextVersion(repo.version, "minor"));
  assert.equal((await readVersions(repo.base)).version, repo.version, "a dry run edits nothing");
  assert.equal((await readFragments(repo.base)).length, 3);

  const result = await prepareRelease({ base: repo.base, date: "2026-09-21" });
  assert.equal(result.bump, "minor");
  assert.equal((await readVersions(repo.base)).version, result.version);
  assert.deepEqual(result.release.entries.map(({ title, pr }) => [title, pr]), [["Tracks", 7], ["Pinned", 3], ["Edge", 5]]);
  assert.deepEqual(await readdir(new URL("changelog/unreleased/", repo.base)), [".gitkeep"]);
  const changelog = await verifyRelease(repo.base);
  assert.deepEqual(changelog.releases.map(({ version }) => version), [result.version, repo.version]);
  assert.equal(await prepareRelease({ base: repo.base }), undefined, "a rerun with nothing pending is a no-op");
});

test("the largest change sets the bump", async (t) => {
  const repo = await fixture(t);
  await writeFile(new URL("changelog/unreleased/a.md", repo.base), fragment("improvement", "A"));
  assert.equal((await prepareRelease({ base: repo.base, dryRun: true })).bump, "patch");
  await writeFile(new URL("changelog/unreleased/b.md", repo.base), fragment("breaking", "B"));
  assert.equal((await prepareRelease({ base: repo.base, dryRun: true })).bump, "major");
});

test("pull requests come from a squash subject, a later merge, or nowhere", async (t) => {
  const repo = await fixture(t);
  assert.equal(inferPullRequest("changelog/unreleased/missing.md", repo.base), undefined);
  await writeFile(new URL("changelog/unreleased/squash.md", repo.base), fragment("fix", "Squash"));
  repo.git("add", ".");
  repo.git("commit", "-qm", "Fix the thing (#12)");
  assert.equal(inferPullRequest("changelog/unreleased/squash.md", repo.base), 12);
  await addOnBranch(repo, "feat/open", { "open.md": fragment("feature", "Open") });
  assert.equal(inferPullRequest("changelog/unreleased/open.md", repo.base), undefined, "unmerged work has no pull request yet");
  assert.equal(inferPullRequest("x", pathToFileURL(tmpdir() + "/")), undefined, "outside a repository");
});

test("check requires an added fragment unless skipped, and rejects invalid ones", async (t) => {
  const repo = await fixture(t);
  repo.git("checkout", "-qb", "feat/none");
  await assert.rejects(checkBranch({ base: repo.base, against: "dev" }), /no-changelog/);
  assert.deepEqual(await checkBranch({ base: repo.base, against: "dev", skip: true }), { added: [], skipped: true });
  await addOnBranch(repo, "feat/some", { "some.md": fragment("feature", "Some") });
  assert.deepEqual((await checkBranch({ base: repo.base, against: "dev" })).added, ["changelog/unreleased/some.md"]);
  await writeFile(new URL("changelog/unreleased/bad.md", repo.base), fragment("chore", "Bad"));
  await assert.rejects(checkBranch({ base: repo.base, against: "dev", skip: true }), /bad\.md: type must be one of/);
  await rm(new URL("changelog/unreleased/bad.md", repo.base));
  await writeFile(new URL("changelog/unreleased/notes.txt", repo.base), "x");
  await assert.rejects(readFragments(repo.base), /fragments are Markdown files/);
});

test("verify catches stale derived files and hand-edited versions", async (t) => {
  const repo = await fixture(t);
  await verifyRelease(repo.base);
  await writeFile(new URL("CHANGELOG.md", repo.base), "# edited\n");
  await assert.rejects(verifyRelease(repo.base), /CHANGELOG\.md is stale/);
  await writeReleaseFiles(await readChangelog(repo.base), repo.base);
  await writeFile(new URL("changelog/latest.json", repo.base), JSON.stringify({ version: "9.9.9", date: "2026-09-01" }));
  await assert.rejects(verifyRelease(repo.base), /latest\.json is stale/);
  const changelog = await readChangelog(repo.base);
  changelog.releases[0].version = "9.9.9";
  await writeReleaseFiles(changelog, repo.base);
  await assert.rejects(verifyRelease(repo.base), /must match the package version/);
});

test("new scaffolds a valid fragment named after the branch without overwriting", async (t) => {
  const repo = await fixture(t);
  repo.git("checkout", "-qb", "feat/Geo_Import");
  assert.equal(await newFragment("feature", "Import tracks", { base: repo.base }), "changelog/unreleased/geo-import.md");
  assert.equal(await newFragment("fix", "Again", { base: repo.base }), "changelog/unreleased/geo-import-2.md");
  assert.equal(await newFragment("fix", "Named", { base: repo.base, branch: "codex/" }), "changelog/unreleased/named.md");
  assert.equal((await readFragments(repo.base)).length, 3);
  await assert.rejects(newFragment("chore", "X", { base: repo.base }), /Type must be one of/);
  await assert.rejects(newFragment("fix", " ", { base: repo.base }), /title/);
});

test("markdown notes use absolute links and cover a version range", async (t) => {
  const repo = await fixture(t);
  const changelog = await readChangelog(repo.base);
  const notes = notesFor(changelog, repo.version);
  assert.match(notes, /^### New\n\n- \*\*First\*\*: The \[first\]\(https:\/\/topostack\.app\/guides\) release\.\n/);
  assert.match(notes, /Full changelog: https:\/\/topostack\.app\/changelog\n$/);
  assert.throws(() => notesFor(changelog, "9.9.9"), /No changelog release 9\.9\.9/);
  assert.match(notesBetween(changelog, "0.0.0"), new RegExp(`^### ${repo.version.replaceAll(".", "\\.")} \\(2026-09-01\\)`));
  assert.equal(notesBetween(changelog, "0.0.0", "0.0.1"), "");
  assert.equal(notesBetween(changelog, repo.version), "");
  assert.match(changelogMarkdown(changelog), /^# Changelog\n/);
});

test("the repository's own changelog is valid and agrees with the package version", async () => {
  const repository = new URL("../../", import.meta.url);
  await verifyRelease(repository);
  await readFragments(repository);
});
