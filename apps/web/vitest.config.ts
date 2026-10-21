import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
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
