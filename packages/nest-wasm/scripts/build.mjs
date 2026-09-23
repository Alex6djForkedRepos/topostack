#!/usr/bin/env node
// Builds the sparrow nesting engine to WebAssembly and writes the committed `pkg/` output.
// Needs rustup (the toolchain comes from rust-toolchain.toml), wasm-bindgen-cli at the exact
// version pinned in Cargo.toml, and binaryen's wasm-opt. Normal app builds never run this.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const crateDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(crateDir, "pkg");
const target = "wasm32-unknown-unknown";
const name = "topostack_nest_wasm";

function run(command, args, env = {}) {
  execFileSync(command, args, { cwd: crateDir, stdio: "inherit", env: { ...process.env, ...env } });
}

function output(command, args) {
  return execFileSync(command, args, { cwd: crateDir, encoding: "utf8" }).trim();
}

function pinnedWasmBindgen() {
  const match = readFileSync(join(crateDir, "Cargo.toml"), "utf8").match(/wasm-bindgen = "=([^"]+)"/);
  if (!match) throw new Error("Cargo.toml must pin wasm-bindgen with an exact version");
  return match[1];
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

function sourceHash() {
  const files = ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", ...sourceFiles(join(crateDir, "src")).filter((file) => file.endsWith(".rs")).map((file) => relative(crateDir, file))].sort();
  const hash = createHash("sha256");
  for (const file of files) hash.update(file).update("\0").update(readFileSync(join(crateDir, file))).update("\0");
  return hash.digest("hex");
}

// `--check` verifies the committed pkg/ was built from the current sources, without Rust.
// Byte-identical rebuilds are not expected across host platforms, so the source hash is the record.
if (process.argv.includes("--check")) {
  const recorded = JSON.parse(readFileSync(join(pkgDir, "BUILD-INFO.json"), "utf8"));
  const wasmHash = createHash("sha256").update(readFileSync(join(pkgDir, `${name}_bg.wasm`))).digest("hex");
  const problems = [
    recorded.sourceSha256 !== sourceHash() && "the crate sources changed since pkg/ was built",
    recorded.wasmSha256 !== wasmHash && "pkg/ does not match its BUILD-INFO.json",
  ].filter(Boolean);
  if (problems.length > 0) {
    console.error(`nest-wasm: ${problems.join("; ")}. Run npm run build:nest-wasm and commit pkg/.`);
    process.exit(1);
  }
  console.log("nest-wasm: pkg/ matches its sources");
  process.exit(0);
}

const bindgenVersion = pinnedWasmBindgen();
const installed = output("wasm-bindgen", ["--version"]).split(" ").pop();
if (installed !== bindgenVersion) {
  throw new Error(`wasm-bindgen-cli ${installed} does not match the pinned ${bindgenVersion}. Run: cargo install wasm-bindgen-cli --version ${bindgenVersion} --locked`);
}

const cargoHome = process.env.CARGO_HOME ?? join(homedir(), ".cargo");
// Strip machine paths so the output only depends on the sources.
const rustflags = [`--remap-path-prefix=${crateDir}=/nest-wasm`, `--remap-path-prefix=${cargoHome}=/cargo`].join("\u001f");
run("cargo", ["build", "--release", "--locked", "--target", target], { CARGO_ENCODED_RUSTFLAGS: rustflags });

rmSync(pkgDir, { recursive: true, force: true });
mkdirSync(pkgDir, { recursive: true });
run("wasm-bindgen", [join("target", target, "release", `${name}.wasm`), "--out-dir", "pkg", "--target", "web"]);
const wasmPath = join(pkgDir, `${name}_bg.wasm`);
run("wasm-opt", ["-O3", "--enable-bulk-memory", "--enable-nontrapping-float-to-int", "--enable-sign-ext", "--enable-mutable-globals", wasmPath, "-o", wasmPath]);
rmSync(join(pkgDir, ".gitignore"), { force: true });

const wasm = readFileSync(wasmPath);
const info = {
  crate: JSON.parse(output("cargo", ["metadata", "--no-deps", "--format-version", "1", "--locked"])).packages[0].version,
  rustc: output("rustc", ["--version"]),
  wasmBindgen: bindgenVersion,
  // Homebrew and the GitHub release word this differently; keep only the version number.
  wasmOpt: output("wasm-opt", ["--version"]).match(/version\D*(\d+)/)?.[1] ?? "unknown",
  sourceSha256: sourceHash(),
  wasmSha256: createHash("sha256").update(wasm).digest("hex"),
  wasmBytes: wasm.length,
};
writeFileSync(join(pkgDir, "BUILD-INFO.json"), `${JSON.stringify(info, null, 2)}\n`);
console.log(`nest-wasm: ${(wasm.length / 1024).toFixed(0)} KiB written to pkg/`);
