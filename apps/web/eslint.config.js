import base from "@chlat/config/eslint";

/**
 * The web app's ESLint config.
 *
 * It starts from the shared config and relaxes the rules that clash with
 * React's JSX model.
 */
export default [
  ...base,
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "next.config.ts"],
    rules: {
      // JSX props are not "unused variables" — the rule misreads them.
      "no-undef": "off",
    },
  },
  {
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    // The Playwright harness runs in Node, not in the browser, so it needs
    // the Node globals and the same `no-undef` relaxation as the scripts
    // above.
    files: ["playwright.config.ts", "e2e/**/*.ts"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
  {
    ignores: [".next/**", "out/**", "next-env.d.ts"],
  },
];
