import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "prisma/config";

/**
 * The Prisma CLI configuration (Prisma 7).
 *
 * Prisma 7 no longer accepts a `url` in `schema.prisma`; the connection
 * string lives here, and the runtime client receives a *driver adapter*
 * instead (see `src/prisma/prisma.service.ts`).
 *
 * `DIRECT_DATABASE_URL` is preferred over `DATABASE_URL` because migrations
 * must bypass a connection pooler — see `specs/data/migrations.md`.
 */
const root = resolve(import.meta.dirname, "..");

// The repository root holds the shared `.env`; the app may also hold its own.
for (const candidate of [resolve(root, ".env"), resolve(import.meta.dirname, ".env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const url = process.env["DIRECT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.ts",
  },
  datasource: {
    url,
  },
});
