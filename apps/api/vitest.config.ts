import { join } from "node:path";

import { defineConfig } from "vitest/config";

/** This config file's own directory — the anchor for the per-package cache paths. */
const here = import.meta.dirname;

/**
 * The API's unit-test configuration.
 *
 * The e2e suite lives in `vitest.e2e.config.ts` and runs in its own pass
 * (`pnpm test:e2e`), because it boots the whole Nest application and needs
 * the environment variables the API validates at boot.
 */
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
    include: ["src/**/*.test.ts", "test/**/*.test.ts", "test/**/*.spec.ts"],
    exclude: ["test/**/*.e2e.test.ts", "test/**/*.e2e.spec.ts"],
    environment: "node",
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
    },
  },
});
