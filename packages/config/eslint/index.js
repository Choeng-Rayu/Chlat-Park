// @ts-check
/**
 * Shared ESLint flat config for Chlat-Park.
 *
 * Consumers spread it from their own `eslint.config.js`:
 *
 *   import base from "@chlat/config/eslint";
 *   export default [...base, { rules: { "no-console": "off" } }];
 *
 * The config is intentionally framework-agnostic: it never imports NestJS or
 * Next.js plugins, so `packages/*` can lint with the same rules as `apps/*`.
 */
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/**
 * Build the shared flat config, optionally appending app-specific overrides.
 *
 * @param {import("eslint").Linter.Config[]} [overrides]
 * @returns {import("eslint").Linter.Config[]}
 */
export function createConfig(overrides = []) {
  return [
    {
      ignores: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.next/**",
        "**/.turbo/**",
        "**/coverage/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/*.d.ts",
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ["**/*.ts", "**/*.tsx"],
      languageOptions: {
        parserOptions: {
          ecmaVersion: "latest",
          sourceType: "module",
        },
      },
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { prefer: "type-imports", fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-explicit-any": "warn",
        "no-console": ["warn", { allow: ["warn", "error"] }],
        eqeqeq: ["error", "always", { null: "ignore" }],
        "prefer-const": "error",
        "no-var": "error",
      },
    },
    {
      files: ["**/*.test.ts", "**/*.spec.ts", "**/test/**", "**/tests/**"],
      rules: {
        "@typescript-eslint/no-explicit-any": "off",
        "no-console": "off",
      },
    },
    // Prettier owns formatting — disable every stylistic ESLint rule so the
    // two tools never fight.
    prettier,
    ...overrides,
  ];
}

export default createConfig();
