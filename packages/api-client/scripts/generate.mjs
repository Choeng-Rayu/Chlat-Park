#!/usr/bin/env node
/**
 * Generate the typed client schema from the OpenAPI document.
 *
 * Two steps:
 *   1. `openapi-typescript` turns `specs/api/openapi.yaml` into
 *      `src/schema.d.ts` — the types the client is built on.
 *   2. nothing else; `src/client.ts` is hand-written on top of `openapi-fetch`.
 *
 * The OpenAPI document is produced by `@chlat/contracts`
 * (`pnpm --filter @chlat/contracts run openapi`). It may not exist yet in a
 * fresh checkout, or while the specs tree is still being written — in that
 * case this script prints a clear message and exits 0, so it never breaks a
 * build that does not actually need the generated types.
 */
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repoRoot = resolve(packageRoot, "../..");
const openApiPath = resolve(repoRoot, "specs/api/openapi.yaml");
const schemaPath = resolve(packageRoot, "src/schema.d.ts");

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: packageRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function main() {
  if (!(await exists(openApiPath))) {
    process.stdout.write(
      `[api-client] Skipping type generation: ${openApiPath} does not exist yet.\n` +
        `[api-client] Generate it first with:\n` +
        `[api-client]   pnpm --filter @chlat/contracts run openapi\n` +
        `[api-client] Continuing with the checked-in schema (if any).\n`,
    );
    return;
  }

  await mkdir(dirname(schemaPath), { recursive: true });

  await run("openapi-typescript", [openApiPath, "-o", schemaPath]);
  process.stdout.write(`[api-client] Wrote ${schemaPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`[api-client] Type generation failed: ${error?.message ?? error}\n`);
  process.exitCode = 1;
});
