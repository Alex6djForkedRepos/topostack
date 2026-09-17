import { spawn } from "node:child_process";

function exitError(command, code, signal) {
  return new Error(`${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`);
}

/** Run a command with inherited stdio; rejects on spawn failure or non-zero exit. */
export function run(command, args, { env = process.env, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => code === 0 ? resolve() : reject(exitError(command, code, signal)));
  });
}

/** Run a command and resolve with its stdout; stderr is inherited. */
export function capture(command, args, { env = process.env, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, cwd, stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("close", (code, signal) => code === 0 ? resolve(output) : reject(exitError(command, code, signal)));
  });
}

/** Bind run/capture to a base child environment (e.g. one with secrets removed). */
export function processRunner(baseEnv) {
  return {
    run: (command, args, extraEnv = {}) => run(command, args, { env: { ...baseEnv, ...extraEnv } }),
    capture: (command, args) => capture(command, args, { env: baseEnv }),
  };
}
