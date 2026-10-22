import { join } from "node:path";

import { defineConfig } from "vitest/config";

/** This config file's own directory — the anchor for the per-package cache paths. */
const here = import.meta.dirname;

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
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "node",
    // The web app's test suite is written by a separate workstream. Until it
    // lands, an empty run must not fail the whole monorepo's test task.
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
    },
  },
});
