// @ts-check
/**
 * Shared Prettier configuration for Chlat-Park.
 *
 * Consumers reference it from `.prettierrc.json`:
 *
 *   { "extends": "@chlat/config/prettier" }
 *
 * The root `.prettierrc.json` in this repo carries the same values inline so
 * that formatting works even without installing the workspace package; keep
 * the two in sync.
 */
export default {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  quoteProps: "as-needed",
  trailingComma: "all",
  bracketSpacing: true,
  arrowParens: "always",
  endOfLine: "lf",
};
