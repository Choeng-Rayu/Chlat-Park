import { defineConfig } from "vitest/config";

/**
 * The API's unit-test configuration.
 *
 * The e2e suite lives in `vitest.e2e.config.ts` and runs in its own pass
 * (`pnpm test:e2e`), because it boots the whole Nest application and needs
 * the environment variables the API validates at boot.
 */
export default defineConfig({
  test: {
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
