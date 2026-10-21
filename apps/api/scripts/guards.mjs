#!/usr/bin/env node
/**
 * Guard for the API's `build` and `typecheck` scripts.
 *
 * The API's source tree is written by a separate workstream. Until it lands,
 * `tsc` and `nest build` have no inputs and fail with "No inputs were found
 * in config file" — a confusing failure that has nothing to do with the code.
 *
 * This guard checks whether the source tree exists first:
 *   - no sources  → print a clear message and exit 0 (nothing to check yet)
 *   - sources      → run the real command
 *
 * Usage:  node scripts/guards.mjs <build|typecheck>
 */
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const srcRoot = resolve(appRoot, "src");

const COMMANDS = {
  build: ["nest", "build"],
  typecheck: ["tsc", "--noEmit"],
};

async function hasSources(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.endsWith(".ts"));
  } catch {
    return false;
  }
}

function run(command, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: appRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", (error) => {
      process.stderr.write(`${error.message}\n`);
      resolvePromise(1);
    });
    child.on("close", (code) => resolvePromise(code ?? 1));
  });
}

const mode = process.argv[2];
const command = COMMANDS[mode];

if (!command) {
  process.stderr.write(`Usage: node scripts/guards.mjs <${Object.keys(COMMANDS).join("|")}>\n`);
  process.exit(2);
}

if (await hasSources(srcRoot)) {
  process.exit(await run(command[0], command.slice(1)));
}

process.stdout.write(
  `[api] Skipping "${mode}": no TypeScript sources in ${srcRoot} yet.\n` +
    `[api] The API's source tree is written by a separate workstream.\n`,
);
process.exit(0);
