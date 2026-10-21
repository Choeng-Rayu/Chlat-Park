import base from "@chlat/config/eslint";

/**
 * The root ESLint config.
 *
 * It applies the shared rules to the whole repository. Each app and package
 * may add its own file-specific overrides on top of this one.
 */
export default [
  ...base,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.d.ts",
    ],
  },
  {
    files: ["**/*.mjs", "**/*.cjs", "**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
];
