import { join } from "node:path";

import { defineConfig } from "vitest/config";

/** This config file's own directory — the anchor for the per-package cache paths. */
const here = import.meta.dirname;

/**
 * The API's end-to-end configuration.
 *
 * The e2e suite boots the real Nest application, so it needs the environment
 * the API validates at boot. The values below are development-grade
 * placeholders — they are never used against a real database, because the
 * skeleton's readiness probe only checks connectivity.
 */
const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://chlat:chlat@localhost:5432/chlat_park_test?schema=public",
  JWT_ACCESS_SECRET: "e2e-access-secret-not-a-real-secret-000000000000",
  JWT_REFRESH_SECRET: "e2e-refresh-secret-not-a-real-secret-0000000000",
  JWT_ACCESS_TTL: "15m",
  JWT_REFRESH_TTL: "7d",
  PLATE_PEPPER: "e2e-plate-pepper-not-a-real-secret-0000000000000",
  ENCRYPTION_KEY: "e2e-encryption-key-not-a-real-secret-00000000000",
  API_PORT: "3001",
  CORS_ORIGINS: "http://localhost:3000",
  RATE_LIMIT_TTL_MS: "60000",
  RATE_LIMIT_LIMIT: "120",
  RATE_LIMIT_LOGIN_TTL_MS: "900000",
  RATE_LIMIT_LOGIN_LIMIT: "10",
} as const;

export default defineConfig({
  // Vitest keeps two caches, and BOTH default to the *workspace root's*
  // `node_modules`, shared by every project in the workspace:
  //
  //   cacheDir          — Vite's transform cache
  //   fsModuleCachePath — Vitest's file-system module cache
  //
  // Turbo runs the package test tasks in parallel, so several Vitest
  // processes then write to one directory and can collide — the cache
  // directory gets removed and recreated underneath them, which surfaces as
  // ENOTEMPTY on the cache directory and fails an otherwise green run.
  //
  // Giving each package its own keeps the parallel runs independent. Both
  // paths sit inside the package's own `node_modules`, which is gitignored
  // and needs no extra ignore rule.
  cacheDir: join(here, "node_modules", ".vite"),
  test: {
    fsModuleCachePath: join(here, "node_modules", ".vitest-cache"),
    include: ["test/**/*.e2e.test.ts", "test/**/*.e2e.spec.ts"],
    environment: "node",
    passWithNoTests: true,
    env: { ...TEST_ENV },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
    },
  },
});
