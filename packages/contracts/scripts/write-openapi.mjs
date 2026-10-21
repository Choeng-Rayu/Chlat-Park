#!/usr/bin/env node
/**
 * Write the OpenAPI document to `specs/api/openapi.yaml`.
 *
 * The document is assembled by `src/openapi.ts` from the same route
 * definitions and Zod schemas the API validates requests with, so the
 * published contract can never drift from the implementation.
 *
 * Run with `pnpm --filter @chlat/contracts run openapi`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const repoRoot = resolve(packageRoot, "../..");
const outputPath = resolve(repoRoot, "specs/api/openapi.yaml");

async function main() {
  // The document is generated from the compiled output so the script runs on
  // plain Node without a TypeScript loader.
  const { buildOpenApiDocument } = await import(
    resolve(packageRoot, "dist/openapi.js").replace(/\\/g, "/")
  );

  const document = buildOpenApiDocument();
  const yaml = stringify(document, { lineWidth: 100, aliasDuplicateObjects: false });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, yaml, "utf8");

  const operationCount = Object.values(document.paths ?? {}).reduce(
    (total, pathItem) =>
      total +
      Object.keys(pathItem).filter((key) =>
        ["get", "put", "post", "delete", "patch", "head", "options", "trace"].includes(key),
      ).length,
    0,
  );

  process.stdout.write(
    `Wrote ${outputPath}\n` +
      `  openapi: ${document.openapi}\n` +
      `  paths:   ${Object.keys(document.paths ?? {}).length}\n` +
      `  ops:     ${operationCount}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`Failed to write the OpenAPI document: ${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
